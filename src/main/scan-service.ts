import { Worker } from 'worker_threads'
import { app, BrowserWindow, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'

import {
  ScannerState,
  ScanSession,
  ScanStartPayload,
  FileNode,
  DuplicateCluster,
  ScanProgressPayload,
  IpcChannel,
  ActionPayload
} from '../shared/types'
import {
  WorkerMessageType,
  type WorkerCommand,
  type WorkerResponse,
  type ScanResultResponse,
  type HashResultResponse,
  type OcrResultResponse
} from '../shared/worker-types'
import { WORKER_POOL_SIZE } from '../shared/constants'
import { logger } from './logger'
import { tagEngine } from './tag-engine'
import { aiService } from './ai-service'

// -----------------
// Constants & Types
// -----------------

const PROGRESS_THROTTLE_MS = 200
const LARGE_FILE_BYTES = 100 * 1024 * 1024 // 100MB

const AI_INDEXABLE_EXTENSIONS = new Set<string>([
  '.txt',
  '.md',
  '.markdown',
  '.pdf',
  '.docx',
  '.doc',
  '.rtf',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.py',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.go',
  '.rs',
  '.php',
  '.rb',
  '.html',
  '.css',
  '.scss'
])

const OCR_IMAGE_EXTENSIONS = new Set<string>(['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'])

const DEFAULT_EXCLUDE_SEGMENTS = new Set<string>([
  'node_modules',
  '.git',
  'AppData',
  'Library',
  'Temp',
  'tmp'
])

// Stronger (but still flexible) settings typing
interface ScanSettings {
  enableOcr?: boolean
  excludePaths?: string[]
}

interface ActionResult {
  success: string[]
  failures: string[]
}

// Simple FIFO queue utility for clarity & reuse
class FifoQueue<T> {
  private items: T[] = []

  enqueue(...items: T[]): void {
    this.items.push(...items)
  }

  dequeue(): T | undefined {
    return this.items.shift()
  }

  clear(): void {
    this.items.length = 0
  }

  get size(): number {
    return this.items.length
  }

  get isEmpty(): boolean {
    return this.items.length === 0
  }

  toArray(): T[] {
    return [...this.items]
  }
}

// -------------
// Scan Service
// -------------

export class ScanService {
  private workers: Worker[] = []
  private workerReadyState: boolean[] = []
  private session: ScanSession | null = null
  private lastUpdate = 0

  // Queues
  private readonly dirQueue = new FifoQueue<string>()
  private readonly hashQueue = new FifoQueue<{ id: string; path: string }>()
  private readonly ocrQueue = new FifoQueue<{ id: string; path: string }>()
  private readonly aiQueue = new FifoQueue<FileNode>()

  // AI backpressure
  private isProcessingAi = false

  // Backpressure & Stats
  private activeWorkers = 0
  private processedFiles = 0
  private processedBytes = 0
  private processedHashes = 0
  private processedOcrDocs = 0

  // In-Memory Results
  private readonly resultFiles: Map<string, FileNode> = new Map()
  private currentSettings: ScanSettings | null = null
  private lastScannedFile = ''

  // Live streaming data for UI
  private recentFlaggedFiles: FileNode[] = []

  // Scan phase tracking for deferred processing
  // Phase 1: Directory scanning only (fast)
  // Phase 2: OCR/Hashing (after dirs complete)
  // Phase 3: AI indexing (runs in background after completion)
  private scanPhase: 'DIRECTORIES' | 'PROCESSING' | 'FINALIZING' = 'DIRECTORIES'

  // -----------------
  // Public API
  // -----------------

  async start(payload: ScanStartPayload): Promise<void> {
    if (this.session?.state === 'SCANNING') {
      logger.warn('Scan start requested but already scanning')
      return
    }

    logger.info('Starting Scan Session', { paths: payload.paths })

    this.currentSettings = (payload.settings ?? null) as ScanSettings | null

    this.session = {
      id: payload.sessionId,
      startedAt: new Date().toISOString(),
      state: 'IDLE',
      duplicates: [],
      largeFiles: [],
      staleFiles: [],
      junkFiles: [],
      emptyFolders: [],
      files: []
    }

    this.resetState()
    this.dirQueue.enqueue(...payload.paths)

    await this.initializeWorkers()

    this.updateState('SCANNING', true)
    this.processQueue()
  }

  cancel(): void {
    logger.info('Cancelling scan session')
    this.terminateWorkers()
    this.updateState('CANCELLED', true)
    this.aiQueue.clear()
  }

  // -----------------
  // Lifecycle & State
  // -----------------

  private resetState(): void {
    this.activeWorkers = 0
    this.processedFiles = 0
    this.processedBytes = 0
    this.processedHashes = 0
    this.processedOcrDocs = 0
    this.lastScannedFile = ''

    this.dirQueue.clear()
    this.hashQueue.clear()
    this.ocrQueue.clear()
    this.aiQueue.clear()
    this.resultFiles.clear()
    this.recentFlaggedFiles = []
    this.scanPhase = 'DIRECTORIES' // Reset to Phase 1

    this.workerReadyState = new Array(WORKER_POOL_SIZE).fill(false)

    if (this.session) {
      this.session.files = []
      this.session.duplicates = []
      this.session.largeFiles = []
      this.session.staleFiles = []
      this.session.junkFiles = []
      this.session.emptyFolders = []
    }
  }

  private async initializeWorkers(): Promise<void> {
    this.terminateWorkers()

    // Robust worker path resolution for Electron/Vite
    const isDev = !app.isPackaged
    const workerScript = isDev
      ? path.join(__dirname, 'worker.js')
      : path.join(process.resourcesPath!, 'app.asar.unpacked', 'out', 'main', 'worker.js')
    logger.info(`Spawning ${WORKER_POOL_SIZE} workers from ${workerScript}`)

    const readyPromises: Promise<void>[] = []

    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
      const readyPromise = new Promise<void>((resolve) => {
        const worker = new Worker(workerScript)

        worker.on('message', (msg: WorkerResponse) => {
          this.handleWorkerMessage(i, msg)

          if (msg.type === WorkerMessageType.RES_READY) {
            resolve()
          }
        })

        worker.on('error', (err) => {
          logger.error(`Worker ${i} error:`, err)
        })

        worker.on('exit', (code) => {
          if (code !== 0) {
            logger.warn(`Worker ${i} exited with code ${code}`)
          }
        })

        this.workers.push(worker)
      })

      readyPromises.push(readyPromise)
    }

    await Promise.all(readyPromises)
    logger.info('All workers ready')
  }

  private terminateWorkers(): void {
    for (const worker of this.workers) {
      try {
        worker.postMessage({ type: WorkerMessageType.CMD_TERMINATE })
        void worker.terminate()
      } catch (err) {
        logger.error('Error terminating worker', err)
      }
    }
    this.workers = []
    this.workerReadyState = []
    this.activeWorkers = 0
  }

  private updateState(state: ScannerState, force = false): void {
    if (!this.session) return

    this.session.state = state

    const now = Date.now()
    if (!force && now - this.lastUpdate < PROGRESS_THROTTLE_MS) {
      return
    }

    this.lastUpdate = now

    // Get top 10 largest files for live streaming
    const liveLargeFiles = [...this.session.largeFiles]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10)

    // Get last 5 flagged files
    const liveFlaggedFiles = this.recentFlaggedFiles.slice(-5)

    // Generate live AI insight
    const liveInsight = this.generateLiveInsight()

    const payload: ScanProgressPayload = {
      sessionId: this.session.id,
      state: this.session.state,
      filesScanned: this.processedFiles,
      bytesScanned: this.processedBytes,
      currentFile: this.lastScannedFile,
      progress: 0, // TODO: add real progress when you have a total
      liveLargeFiles,
      liveFlaggedFiles,
      liveInsight
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IpcChannel.ScanProgress, payload)
    })
  }

  private generateLiveInsight(): string {
    if (!this.session) return ''

    const largeCount = this.session.largeFiles.length

    // Count tags from recent flagged files
    const tagCounts: Record<string, number> = {}
    for (const f of this.recentFlaggedFiles) {
      for (const tag of f.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      }
    }

    // Build insight message
    const insights: string[] = []

    if (largeCount > 0) {
      const totalSize = this.session.largeFiles.reduce((sum, f) => sum + f.sizeBytes, 0)
      insights.push(
        `📦 Found ${largeCount} large file${largeCount > 1 ? 's' : ''} (${this.formatBytes(totalSize)} total)`
      )
    }

    if (tagCounts['INVOICE']) {
      insights.push(
        `📄 Detected ${tagCounts['INVOICE']} invoice/receipt file${tagCounts['INVOICE'] > 1 ? 's' : ''}`
      )
    }
    if (tagCounts['SCREENSHOT']) {
      insights.push(
        `📸 Found ${tagCounts['SCREENSHOT']} screenshot${tagCounts['SCREENSHOT'] > 1 ? 's' : ''}`
      )
    }
    if (tagCounts['FINANCIAL']) {
      insights.push(
        `💰 Found ${tagCounts['FINANCIAL']} financial document${tagCounts['FINANCIAL'] > 1 ? 's' : ''}`
      )
    }
    if (tagCounts['PERSONAL']) {
      insights.push(
        `👤 Detected ${tagCounts['PERSONAL']} personal document${tagCounts['PERSONAL'] > 1 ? 's' : ''}`
      )
    }
    if (tagCounts['CONTRACT']) {
      insights.push(
        `📝 Found ${tagCounts['CONTRACT']} contract/agreement${tagCounts['CONTRACT'] > 1 ? 's' : ''}`
      )
    }

    if (insights.length === 0 && this.processedFiles > 100) {
      insights.push(`🔍 Scanning... ${this.processedFiles.toLocaleString()} files analyzed`)
    }

    return insights.join(' • ') || '🔍 Analyzing files...'
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // -----------------
  // Work Dispatching
  // -----------------

  private processQueue(): void {
    if (!this.session || this.session.state !== 'SCANNING') return

    // Phase 1: Prioritize directory scanning
    if (this.scanPhase === 'DIRECTORIES') {
      const dirsComplete = this.dirQueue.isEmpty && this.activeWorkers === 0

      if (dirsComplete) {
        // Transition to Phase 2: Process OCR and hashing
        logger.info(
          `Phase 1 complete: ${this.processedFiles} files discovered. Starting Phase 2 (OCR/Hashing)...`
        )
        this.scanPhase = 'PROCESSING'
      } else {
        // Continue directory scanning only
        for (let i = 0; i < this.workers.length; i++) {
          if (!this.workerReadyState[i]) continue

          const dir = this.dirQueue.dequeue()
          if (dir) {
            this.dispatchToWorker(i, {
              type: WorkerMessageType.CMD_SCAN_DIR,
              path: dir,
              exclusions: this.currentSettings?.excludePaths || []
            })
          }
        }
        return
      }
    }

    // Phase 2: Process OCR and hashing (after all directories scanned)
    if (this.scanPhase === 'PROCESSING') {
      const processingComplete =
        this.hashQueue.isEmpty && this.ocrQueue.isEmpty && this.activeWorkers === 0

      if (processingComplete) {
        // Transition to finalization
        this.scanPhase = 'FINALIZING'
        void this.finalizeScan()
        return
      }

      // Dispatch OCR and hash work
      for (let i = 0; i < this.workers.length; i++) {
        if (!this.workerReadyState[i]) continue

        // Prioritize hashing (faster than OCR)
        const hashItem = this.hashQueue.dequeue()
        if (hashItem) {
          this.dispatchToWorker(i, {
            type: WorkerMessageType.CMD_HASH_FILE,
            id: hashItem.id,
            filePath: hashItem.path
          })
          continue
        }

        // Then OCR
        const ocrItem = this.ocrQueue.dequeue()
        if (ocrItem) {
          this.dispatchToWorker(i, {
            type: WorkerMessageType.CMD_OCR_FILE,
            id: ocrItem.id,
            filePath: ocrItem.path
          })
          continue
        }
      }
      return
    }

    // Phase 3 (FINALIZING) is handled by finalizeScan()
  }

  private dispatchToWorker(index: number, cmd: WorkerCommand): void {
    this.workerReadyState[index] = false
    this.activeWorkers++

    try {
      this.workers[index].postMessage(cmd)
    } catch (err) {
      this.activeWorkers--
      this.workerReadyState[index] = true
      logger.error('Failed to post message to worker', err)
    }
  }

  // -----------------
  // AI Queue Handling
  // -----------------

  private async processAiQueue(): Promise<void> {
    if (this.isProcessingAi || this.aiQueue.isEmpty) return

    this.isProcessingAi = true
    try {
      const file = this.aiQueue.dequeue()
      if (file) {
        await aiService.indexFile(file).catch((err: unknown) => {
          logger.error('AI index failed', err)
        })
      }
    } finally {
      this.isProcessingAi = false
      if (!this.aiQueue.isEmpty) {
        setImmediate(() => {
          void this.processAiQueue()
        })
      }
    }
  }

  // -----------------
  // Worker Messages
  // -----------------

  private handleWorkerMessage(index: number, msg: WorkerResponse): void {
    switch (msg.type) {
      case WorkerMessageType.RES_READY:
        this.workerReadyState[index] = true
        break

      case WorkerMessageType.RES_SCAN_RESULT: {
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleScanResult(msg)
        this.processQueue()
        break
      }

      case WorkerMessageType.RES_HASH_RESULT: {
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleHashResult(msg)
        this.processQueue()
        break
      }

      case WorkerMessageType.RES_OCR_RESULT: {
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleOcrResult(msg)
        this.processQueue()
        break
      }

      case WorkerMessageType.RES_ERROR: {
        this.workerReadyState[index] = true
        this.activeWorkers--
        logger.warn(`Worker Error: ${msg.error} at ${msg.path}`)
        this.processQueue()
        break
      }

      default:
        logger.warn('Unknown worker message type', msg)
    }
  }

  // -----------------
  // Scan Result Handling
  // -----------------

  private handleScanResult(res: ScanResultResponse): void {
    if (!this.session) return

    const validDirs = res.dirs.filter((d) => !this.shouldIgnore(d))
    if (validDirs.length > 0) {
      this.dirQueue.enqueue(...validDirs)
    }

    for (const f of res.files) {
      if (this.shouldIgnore(f.path)) continue

      this.resultFiles.set(f.id, f)
      this.processedFiles++
      this.processedBytes += f.sizeBytes
      this.lastScannedFile = f.path

      if (f.sizeBytes > LARGE_FILE_BYTES) {
        this.session.largeFiles.push(f)
      }

      f.tags = tagEngine.analyze(f)

      // Track flagged files for live streaming to UI
      if (f.tags.length > 0) {
        this.recentFlaggedFiles.push(f)
        // Keep only last 50 to prevent memory bloat
        if (this.recentFlaggedFiles.length > 50) {
          this.recentFlaggedFiles = this.recentFlaggedFiles.slice(-50)
        }
      }

      const ext = path.extname(f.name).toLowerCase()

      if (AI_INDEXABLE_EXTENSIONS.has(ext)) {
        this.aiQueue.enqueue(f)
      }

      if (this.currentSettings?.enableOcr && OCR_IMAGE_EXTENSIONS.has(ext)) {
        this.ocrQueue.enqueue({ id: f.id, path: f.path })
      }
    }

    this.updateState('SCANNING')
  }

  private handleHashResult(res: HashResultResponse): void {
    // O(1) lookup by ID
    const file = this.resultFiles.get(res.id)
    if (file) {
      file.hash = res.hash
      this.processedHashes++
      this.updateState('SCANNING')
    }
  }

  private handleOcrResult(res: OcrResultResponse): void {
    if (!this.session) return

    // O(1) lookup by ID
    const file = this.resultFiles.get(res.id)
    if (!file) return

    file.metadata = { ...file.metadata, text: res.text }

    const newTags = tagEngine.analyze(file)
    const mergedTags = new Set(file.tags ?? [])
    for (const t of newTags) mergedTags.add(t)
    file.tags = Array.from(mergedTags)

    // Queue for re-index
    this.aiQueue.enqueue(file)

    this.processedOcrDocs++
    this.updateState('SCANNING')
  }

  private shouldIgnore(filePath: string): boolean {
    const settingsExcludes = this.currentSettings?.excludePaths ?? []
    const basename = path.basename(filePath)

    // Direct basename match
    if (DEFAULT_EXCLUDE_SEGMENTS.has(basename)) return true
    if (settingsExcludes.includes(basename)) return true

    // Path-segment level ignore (a bit more robust)
    const segments = filePath.split(path.sep)
    if (segments.some((seg) => DEFAULT_EXCLUDE_SEGMENTS.has(seg))) {
      return true
    }
    if (segments.some((seg) => settingsExcludes.includes(seg))) {
      return true
    }

    // Special-case system roots
    if (filePath.startsWith('/System') || filePath.startsWith('C:\\Windows')) {
      return true
    }

    return false
  }

  // -----------------
  // Finalization
  // -----------------

  private async finalizeScan(): Promise<void> {
    // Check if we need to queue files for hashing (duplicate detection)
    if (this.processedHashes === 0 && this.resultFiles.size > 0) {
      const candidates = this.identifyHashCandidates()
      if (candidates.length > 0) {
        this.hashQueue.clear()
        this.hashQueue.enqueue(...candidates.map((f) => ({ id: f.id, path: f.path })))
        logger.info(`Queued ${this.hashQueue.size} files for hashing (Phase 2)`)
        // Go back to processing phase to handle hash queue
        this.scanPhase = 'PROCESSING'
        this.processQueue()
        return
      }
    }

    await this.buildDuplicateClusters()

    // Persist AI Vector DB to disk
    try {
      await aiService.saveDb()
    } catch (err) {
      logger.error('Failed to save Vector DB', err)
    }

    logger.info('Scan complete.')
    this.updateState('COMPLETED', true)
    this.terminateWorkers()

    // Phase 3: Let AI queue drain in background
    void this.processAiQueue()
  }

  private identifyHashCandidates(): FileNode[] {
    const sizeMap = new Map<number, FileNode[]>()

    for (const file of this.resultFiles.values()) {
      if (file.isDirectory) continue

      const list = sizeMap.get(file.sizeBytes) ?? []
      list.push(file)
      sizeMap.set(file.sizeBytes, list)
    }

    const candidates: FileNode[] = []
    for (const [size, list] of sizeMap) {
      if (size > 0 && list.length > 1) {
        candidates.push(...list)
      }
    }
    return candidates
  }

  private async buildDuplicateClusters(): Promise<void> {
    if (!this.session) return

    const clusters: DuplicateCluster[] = []
    const hashMap = new Map<string, FileNode[]>()

    for (const file of this.resultFiles.values()) {
      if (!file.hash) continue

      const list = hashMap.get(file.hash) ?? []
      list.push(file)
      hashMap.set(file.hash, list)
    }

    for (const [hash, list] of hashMap) {
      if (list.length > 1) {
        clusters.push({ hash, files: list, type: 'EXACT' })
      }
    }

    this.session.duplicates = clusters
    this.session.files = Array.from(this.resultFiles.values())

    try {
      const { deduplicationService } = await import('./deduplication-service')
      const semanticClusters = await deduplicationService.findSemanticDuplicates(this.session.files)

      if (semanticClusters.length > 0) {
        this.session.duplicates.push(...semanticClusters)
        logger.info(`Added ${semanticClusters.length} semantic clusters to results`)
      }
    } catch (err) {
      logger.error('Semantic deduplication failed', err)
    }

    logger.info(
      `Analysis finished. Identified ${this.session.duplicates.length} total duplicate clusters.`
    )
  }

  // -----------------
  // Actions
  // -----------------

  async moveToTrash(payload: ActionPayload): Promise<ActionResult> {
    const success: string[] = []
    const failures: string[] = []

    for (const id of payload.fileIds) {
      const file = this.resultFiles.get(id)
      if (!file) {
        logger.warn(`Trash action: File not found ${id}`)
        failures.push(id)
        continue
      }

      if (payload.dryRun) {
        logger.info(`[DryRun] Would trash: ${file.path}`)
        success.push(id)
        continue
      }

      try {
        await shell.trashItem(file.path)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`Failed to trash ${file.path}`, { error: errorMsg })
        failures.push(id)
      }
    }

    return { success, failures }
  }

  async quarantine(payload: ActionPayload): Promise<ActionResult> {
    const success: string[] = []
    const failures: string[] = []

    const quarantineDir = path.join(app.getPath('userData'), '_Quarantine')

    try {
      await fs.mkdir(quarantineDir, { recursive: true })
    } catch (err) {
      logger.error('Failed to create quarantine dir', err)
      return { success: [], failures: payload.fileIds }
    }

    for (const id of payload.fileIds) {
      const file = this.resultFiles.get(id)
      if (!file) {
        failures.push(id)
        continue
      }

      if (payload.dryRun) {
        logger.info(`[DryRun] Would quarantine: ${file.path}`)
        success.push(id)
        continue
      }

      try {
        const dest = path.join(quarantineDir, `${path.basename(file.path)}_${Date.now()}.bak`)
        await fs.rename(file.path, dest)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`Failed to quarantine ${file.path}`, { error: errorMsg })
        failures.push(id)
      }
    }

    return { success, failures }
  }

  async moveFiles(payload: ActionPayload & { destination: string }): Promise<ActionResult> {
    const success: string[] = []
    const failures: string[] = []

    try {
      if (!payload.dryRun) {
        await fs.mkdir(payload.destination, { recursive: true })
      }
    } catch (err) {
      logger.error(`Failed to create dest dir ${payload.destination}`, err)
      return { success: [], failures: payload.fileIds }
    }

    for (const id of payload.fileIds) {
      const file = this.resultFiles.get(id)
      if (!file) {
        failures.push(id)
        continue
      }

      if (payload.dryRun) {
        logger.info(`[DryRun] Would move ${file.path} to ${payload.destination}`)
        success.push(id)
        continue
      }

      try {
        const destPath = path.join(payload.destination, path.basename(file.path))

        try {
          await fs.access(destPath)
          logger.warn(`Destination exists for ${file.path}`)
          failures.push(id)
          continue
        } catch {
          // File does not exist, safe to proceed
        }

        await fs.rename(file.path, destPath)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`Failed to move ${file.path}`, { error: errorMsg })
        failures.push(id)
      }
    }

    return { success, failures }
  }
}

export const scanService = new ScanService()
