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
  WorkerCommand,
  WorkerResponse,
  ScanResultResponse,
  HashResultResponse,
  OcrResultResponse
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
  // extend as needed
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
  private readonly hashQueue = new FifoQueue<string>()
  private readonly ocrQueue = new FifoQueue<string>()
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

  constructor() {}

  // -----------------
  // Public API
  // -----------------

  async start(payload: ScanStartPayload): Promise<void> {
    if (this.session?.state === 'SCANNING') {
      logger.warn('Scan start requested but already scanning')
      return
    }

    logger.info('Starting Scan Session', { paths: payload.paths })

    this.currentSettings = (payload.settings as ScanSettings | undefined) ?? null

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

    const workerScript = path.join(__dirname, 'worker.js')
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

    const payload: ScanProgressPayload = {
      sessionId: this.session.id,
      state: this.session.state,
      filesScanned: this.processedFiles,
      bytesScanned: this.processedBytes,
      currentFile: this.lastScannedFile,
      progress: 0 // TODO: add real progress when you have a total
    }

    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send(IpcChannel.ScanProgress, payload)
    })
  }

  // -----------------
  // Work Dispatching
  // -----------------

  private processQueue(): void {
    if (!this.session || this.session.state !== 'SCANNING') return

    const noWorkLeft =
      this.dirQueue.isEmpty &&
      this.hashQueue.isEmpty &&
      this.ocrQueue.isEmpty &&
      this.activeWorkers === 0

    if (noWorkLeft) {
      if (this.session.duplicates.length === 0 && this.processedFiles > 0) {
        void this.finalizeScan()
      } else {
        this.terminateWorkers()
        this.updateState('COMPLETED', true)
        // Let AI queue finish gradually
        void this.processAiQueue()
      }
      return
    }

    for (let i = 0; i < this.workers.length; i++) {
      if (!this.workerReadyState[i]) continue

      // 1. Directories
      const dir = this.dirQueue.dequeue()
      if (dir) {
        this.dispatchToWorker(i, {
          type: WorkerMessageType.CMD_SCAN_DIR,
          path: dir
        })
        continue
      }

      // 2. Hashing
      const hashFile = this.hashQueue.dequeue()
      if (hashFile) {
        this.dispatchToWorker(i, {
          type: WorkerMessageType.CMD_HASH_FILE,
          filePath: hashFile
        })
        continue
      }

      // 3. OCR
      const ocrFile = this.ocrQueue.dequeue()
      if (ocrFile) {
        this.dispatchToWorker(i, {
          type: WorkerMessageType.CMD_OCR_FILE,
          filePath: ocrFile
        })
        continue
      }
    }

    void this.processAiQueue()
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
        await aiService.indexFile(file).catch((err) => logger.error('AI index failed', err))
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

      const ext = path.extname(f.name).toLowerCase()

      if (AI_INDEXABLE_EXTENSIONS.has(ext)) {
        this.aiQueue.enqueue(f)
      }

      if (this.currentSettings?.enableOcr && OCR_IMAGE_EXTENSIONS.has(ext)) {
        this.ocrQueue.enqueue(f.path)
      }
    }

    this.updateState('SCANNING')
  }

  private handleHashResult(res: HashResultResponse): void {
    const file = this.resultFiles.get(res.id)
    if (!file) return

    file.hash = res.hash
    this.processedHashes++
    this.updateState('SCANNING')
  }

  private handleOcrResult(res: OcrResultResponse): void {
    if (!this.session) return

    for (const file of this.resultFiles.values()) {
      if (file.path !== res.filePath) continue

      file.metadata = { ...file.metadata, text: res.text }

      const newTags = tagEngine.analyze(file)
      const mergedTags = new Set<string>([...(file.tags ?? []), ...newTags])
      file.tags = Array.from(mergedTags)

      // Queue for re-index
      this.aiQueue.enqueue(file)
      break
    }

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
    if (this.processedHashes === 0 && this.resultFiles.size > 0) {
      logger.info('Scan Phase 1 complete. Identifying candidates for hashing...')

      const candidates = this.identifyHashCandidates()
      if (candidates.length > 0) {
        this.hashQueue.clear()
        this.hashQueue.enqueue(...candidates.map((f) => f.path))
        logger.info(`Queued ${this.hashQueue.size} files for hashing`)
        this.processQueue()
        return
      }
    }

    await this.buildDuplicateClusters()

    logger.info('Scan complete.')
    this.updateState('COMPLETED', true)
    this.terminateWorkers()

    // Let AI queue drain
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

  async moveToTrash(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }> {
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
      } catch (err: any) {
        logger.error(`Failed to trash ${file.path}`, { error: err?.message })
        failures.push(id)
      }
    }

    return { success, failures }
  }

  async quarantine(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }> {
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
      } catch (err: any) {
        logger.error(`Failed to quarantine ${file.path}`, { error: err?.message })
        failures.push(id)
      }
    }

    return { success, failures }
  }

  async moveFiles(
    payload: ActionPayload & { destination: string }
  ): Promise<{ success: string[]; failures: string[] }> {
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
      } catch (err: any) {
        logger.error(`Failed to move ${file.path}`, { error: err?.message })
        failures.push(id)
      }
    }

    return { success, failures }
  }
}

export const scanService = new ScanService()
