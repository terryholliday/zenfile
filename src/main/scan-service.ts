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

interface ScanSettings {
  enableOcr?: boolean
  excludePaths?: string[]
}

interface ActionResult {
  success: string[]
  failures: string[]
}

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

  // Stats
  private activeWorkers = 0
  private processedFiles = 0
  private processedBytes = 0
  private processedHashes = 0
  private processedOcrDocs = 0

  // In-Memory Results
  private readonly resultFiles: Map<string, FileNode> = new Map()
  private currentSettings: ScanSettings | null = null
  private lastScannedFile = ''
  private recentFlaggedFiles: FileNode[] = []
  private scanPhase: 'DIRECTORIES' | 'PROCESSING' | 'FINALIZING' = 'DIRECTORIES'

  // Delayed HTML processing
  private delayedHtmlFiles: FileNode[] = []

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

  // FIX: Added getResults method which determines the IPC contract
  getResults(sessionId: string): ScanSession | null {
    if (this.session && this.session.id === sessionId) {
      return this.session
    }
    return null
  }

  cancel(): void {
    logger.info('Cancelling scan session')
    this.terminateWorkers()
    this.updateState('CANCELLED', true)
    this.aiQueue.clear()
  }

  // -----------------
  // Lifecycle
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
    this.delayedHtmlFiles = []
    this.scanPhase = 'DIRECTORIES'
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

    // FIX: Safer path resolution
    const isDev = !app.isPackaged
    const resourcePath = process.resourcesPath || ''
    const workerScript = isDev
      ? path.join(__dirname, 'worker.js')
      : path.join(resourcePath, 'app.asar.unpacked', 'out', 'main', 'worker.js')

    logger.info(`Spawning ${WORKER_POOL_SIZE} workers from ${workerScript}`)

    const readyPromises: Promise<void>[] = []
    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
      const readyPromise = new Promise<void>((resolve) => {
        const worker = new Worker(workerScript)
        worker.on('message', (msg: WorkerResponse) => {
          this.handleWorkerMessage(i, msg)
          if (msg.type === WorkerMessageType.RES_READY) resolve()
        })
        worker.on('error', (err) => logger.error(`Worker ${i} error:`, err))
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
    if (!force && now - this.lastUpdate < PROGRESS_THROTTLE_MS) return
    this.lastUpdate = now

    const liveLargeFiles = [...this.session.largeFiles]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10)
    const liveFlaggedFiles = this.recentFlaggedFiles.slice(-5)
    const liveInsight = this.generateLiveInsight()

    const payload: ScanProgressPayload = {
      sessionId: this.session.id,
      state: this.session.state,
      filesScanned: this.processedFiles,
      bytesScanned: this.processedBytes,
      currentFile: this.lastScannedFile,
      progress: 0,
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
    const tagCounts: Record<string, number> = {}
    for (const f of this.recentFlaggedFiles) {
      for (const tag of f.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + 1
    }
    const insights: string[] = []
    if (largeCount > 0)
      insights.push(`📦 Found ${largeCount} large file${largeCount > 1 ? 's' : ''}`)
    if (tagCounts['INVOICE']) insights.push(`📄 ${tagCounts['INVOICE']} invoices`)
    if (tagCounts['FINANCIAL']) insights.push(`💰 ${tagCounts['FINANCIAL']} financial docs`)

    if (insights.length === 0 && this.processedFiles > 100) {
      return `🔍 Scanning... ${this.processedFiles.toLocaleString()} files analyzed`
    }
    return insights.join(' • ') || '🔍 Analyzing files...'
  }

  // -----------------
  // Work Dispatching
  // -----------------

  private processQueue(): void {
    if (!this.session || this.session.state !== 'SCANNING') return

    if (this.scanPhase === 'DIRECTORIES') {
      const dirsComplete = this.dirQueue.isEmpty && this.activeWorkers === 0
      if (dirsComplete) {
        logger.info(`Phase 1 complete: ${this.processedFiles} files. Starting Phase 2.`)
        this.scanPhase = 'PROCESSING'
      } else {
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

    if (this.scanPhase === 'PROCESSING') {
      const processingComplete =
        this.hashQueue.isEmpty && this.ocrQueue.isEmpty && this.activeWorkers === 0
      if (processingComplete) {
        this.scanPhase = 'FINALIZING'
        void this.finalizeScan()
        return
      }
      for (let i = 0; i < this.workers.length; i++) {
        if (!this.workerReadyState[i]) continue
        const hashItem = this.hashQueue.dequeue()
        if (hashItem) {
          this.dispatchToWorker(i, {
            type: WorkerMessageType.CMD_HASH_FILE,
            id: hashItem.id,
            filePath: hashItem.path
          })
          continue
        }
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
  // AI Queue
  // -----------------

  private aiQueuePromise: Promise<void> | null = null
  private aiResolve: (() => void) | null = null

  private startAiQueueProcessor() {
    if (this.isProcessingAi) return
    this.isProcessingAi = true
    void this.processAiQueueLoop()
  }

  private async processAiQueueLoop() {
    while (!this.aiQueue.isEmpty) {
      const file = this.aiQueue.dequeue()
      if (file) {
        try {
          await aiService.indexFile(file)
          if (file.metadata?.text) delete file.metadata.text
        } catch (e) {
          logger.error('AI index error', e)
        }
      }
      await new Promise((r) => setImmediate(r))
    }
    this.isProcessingAi = false
    if (this.aiResolve) {
      this.aiResolve()
      this.aiResolve = null
      this.aiQueuePromise = null
    }
  }

  private enqueueAi(file: FileNode) {
    this.aiQueue.enqueue(file)
    this.startAiQueueProcessor()
  }

  private async waitForAiDrain(): Promise<void> {
    if (this.aiQueue.isEmpty && !this.isProcessingAi) return
    if (!this.aiQueuePromise) {
      this.aiQueuePromise = new Promise((resolve) => {
        this.aiResolve = resolve
      })
    }
    return this.aiQueuePromise
  }

  // -----------------
  // Result Handling
  // -----------------

  private handleWorkerMessage(index: number, msg: WorkerResponse): void {
    switch (msg.type) {
      case WorkerMessageType.RES_READY:
        this.workerReadyState[index] = true
        break
      case WorkerMessageType.RES_SCAN_RESULT:
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleScanResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_HASH_RESULT:
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleHashResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_OCR_RESULT:
        this.workerReadyState[index] = true
        this.activeWorkers--
        this.handleOcrResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_ERROR:
        this.workerReadyState[index] = true
        this.activeWorkers--
        logger.warn(`Worker Error: ${msg.error} at ${msg.path}`)
        this.processQueue()
        break
    }
  }

  private handleScanResult(res: ScanResultResponse): void {
    if (!this.session) return
    const validDirs = res.dirs.filter((d) => !this.shouldIgnore(d))
    if (validDirs.length > 0) this.dirQueue.enqueue(...validDirs)

    for (const f of res.files) {
      if (this.shouldIgnore(f.path)) continue
      this.resultFiles.set(f.id, f)
      this.processedFiles++
      this.processedBytes += f.sizeBytes
      this.lastScannedFile = f.path

      if (f.sizeBytes > LARGE_FILE_BYTES) this.session.largeFiles.push(f)

      if (f.tags.length > 0) {
        this.recentFlaggedFiles.push(f)
        if (this.recentFlaggedFiles.length > 50)
          this.recentFlaggedFiles = this.recentFlaggedFiles.slice(-50)
      }

      const ext = path.extname(f.name).toLowerCase()

      // Heuristic: Delay HTML
      if (ext === '.html' || ext === '.htm') {
        this.delayedHtmlFiles.push(f)
      } else if (AI_INDEXABLE_EXTENSIONS.has(ext)) {
        this.enqueueAi(f)
      }

      if (this.currentSettings?.enableOcr && OCR_IMAGE_EXTENSIONS.has(ext)) {
        this.ocrQueue.enqueue({ id: f.id, path: f.path })
      }
    }
    this.updateState('SCANNING')
  }

  private handleHashResult(res: HashResultResponse): void {
    const file = this.resultFiles.get(res.id)
    if (file) {
      file.hash = res.hash
      this.processedHashes++
      this.updateState('SCANNING')
    }
  }

  private handleOcrResult(res: OcrResultResponse): void {
    const file = this.resultFiles.get(res.id)
    if (!file) return
    file.metadata = { ...file.metadata, text: res.text }
    const newTags = tagEngine.analyze(file)
    const mergedTags = new Set(file.tags ?? [])
    for (const t of newTags) mergedTags.add(t)
    file.tags = Array.from(mergedTags)
    this.enqueueAi(file)
    this.processedOcrDocs++
    this.updateState('SCANNING')
  }

  private shouldIgnore(filePath: string): boolean {
    const settingsExcludes = this.currentSettings?.excludePaths ?? []
    const basename = path.basename(filePath)
    if (DEFAULT_EXCLUDE_SEGMENTS.has(basename)) return true
    if (settingsExcludes.includes(basename)) return true
    const segments = filePath.split(path.sep)
    if (segments.some((seg) => DEFAULT_EXCLUDE_SEGMENTS.has(seg))) return true
    if (segments.some((seg) => settingsExcludes.includes(seg))) return true
    if (filePath.startsWith('/System') || filePath.startsWith('C:\\Windows')) return true
    return false
  }

  // -----------------
  // Finalization
  // -----------------

  private async finalizeScan(): Promise<void> {
    // 1. Process delayed HTML
    this.processDelayedHtmlFiles()

    // 2. Queue Hashing
    if (this.processedHashes === 0 && this.resultFiles.size > 0) {
      const candidates = this.identifyHashCandidates()
      if (candidates.length > 0) {
        this.hashQueue.clear()
        this.hashQueue.enqueue(...candidates.map((f) => ({ id: f.id, path: f.path })))
        logger.info(`Queued ${this.hashQueue.size} files for hashing (Phase 2)`)
        this.scanPhase = 'PROCESSING'
        this.processQueue()
        return
      }
    }

    // 3. Duplicates
    await this.buildDuplicateClusters()

    // 4. Wait AI
    logger.info('Waiting for AI indexing to finish...')
    await this.waitForAiDrain()

    // 5. Save & Clean
    try {
      await aiService.saveDb()
    } catch (err) {
      logger.error('Failed to save Vector DB', err)
    }

    // FIX: Safely call clearCache
    if (typeof aiService.clearCache === 'function') {
      aiService.clearCache()
    }

    logger.info('Scan complete.')
    this.updateState('COMPLETED', true)
    this.terminateWorkers()
  }

  private processDelayedHtmlFiles(): void {
    logger.info(`Analyzing ${this.delayedHtmlFiles.length} HTML files...`)
    const getCanonicalName = (name: string) => {
      const base = name.replace(/\.[^/.]+$/, '')
      return base
        .replace(/(\s*[\(\-]?\s*(copy|\d+)\s*[\)]?)+$/i, '')
        .trim()
        .toLowerCase()
    }
    const groups = new Map<string, FileNode[]>()
    for (const f of this.delayedHtmlFiles) {
      const canonical = getCanonicalName(f.name)
      if (!groups.has(canonical)) groups.set(canonical, [])
      groups.get(canonical)!.push(f)
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        const sorted = group.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0))
        let hasSimilarDates = false
        for (let i = 0; i < sorted.length - 1; i++) {
          if (Math.abs((sorted[i + 1].mtimeMs || 0) - (sorted[i].mtimeMs || 0)) < 60000) {
            hasSimilarDates = true
            break
          }
        }
        if (hasSimilarDates) {
          for (const f of group) this.enqueueAi(f)
        }
      }
    }
    this.delayedHtmlFiles = []
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
      if (size > 0 && list.length > 1) candidates.push(...list)
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
      if (list.length > 1) clusters.push({ hash, files: list, type: 'EXACT' })
    }
    this.session.duplicates = clusters
    this.session.files = Array.from(this.resultFiles.values())
    try {
      const { deduplicationService } = await import('./deduplication-service')
      const semanticClusters = await deduplicationService.findSemanticDuplicates(this.session.files)
      if (semanticClusters.length > 0) this.session.duplicates.push(...semanticClusters)
    } catch (err) {
      logger.error('Semantic deduplication failed', err)
    }
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
        failures.push(id)
        continue
      }
      if (payload.dryRun) {
        success.push(id)
        continue
      }
      try {
        await shell.trashItem(file.path)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: unknown) {
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
    } catch {
      return { success: [], failures: payload.fileIds }
    }

    for (const id of payload.fileIds) {
      const file = this.resultFiles.get(id)
      if (!file) {
        failures.push(id)
        continue
      }
      if (payload.dryRun) {
        success.push(id)
        continue
      }
      try {
        const dest = path.join(quarantineDir, `${path.basename(file.path)}_${Date.now()}.bak`)
        await fs.rename(file.path, dest)
        this.resultFiles.delete(id)
        success.push(id)
      } catch {
        failures.push(id)
      }
    }
    return { success, failures }
  }

  async moveFiles(payload: ActionPayload & { destination: string }): Promise<ActionResult> {
    const success: string[] = []
    const failures: string[] = []
    try {
      if (!payload.dryRun) await fs.mkdir(payload.destination, { recursive: true })
    } catch {
      return { success: [], failures: payload.fileIds }
    }

    for (const id of payload.fileIds) {
      const file = this.resultFiles.get(id)
      if (!file) {
        failures.push(id)
        continue
      }
      if (payload.dryRun) {
        success.push(id)
        continue
      }
      try {
        const destPath = path.join(payload.destination, path.basename(file.path))
        try {
          await fs.access(destPath)
          failures.push(id)
          continue
        } catch {}
        await fs.rename(file.path, destPath)
        this.resultFiles.delete(id)
        success.push(id)
      } catch {
        failures.push(id)
      }
    }
    return { success, failures }
  }
}

export const scanService = new ScanService()
