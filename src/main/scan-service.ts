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

// REMOVED '.html' from here. It is now handled via the heuristic.
const AI_INDEXABLE_EXTENSIONS = new Set<string>([
  '.txt', '.md', '.markdown', '.pdf', '.docx', '.doc', '.rtf',
  '.ts', '.tsx', '.js', '.jsx', '.json', '.py', '.java', '.c', 
  '.cpp', '.h', '.cs', '.go', '.rs', '.php', '.rb', '.css', '.scss'
])

const OCR_IMAGE_EXTENSIONS = new Set<string>(['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'])

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
  private readonly hashQueueIds = new FifoQueue<string>()
  private readonly ocrQueueIds = new FifoQueue<string>()
  private readonly aiQueue = new FifoQueue<FileNode>()

  // Special holding area for HTML files to apply the "heuristic" later
  private delayedHtmlFiles: FileNode[] = []

  // AI backpressure
  private isProcessingAi = false

  // Stats
  private activeWorkers = 0
  private processedFiles = 0
  private processedBytes = 0
  private processedHashes = 0
  private processedOcrDocs = 0

  // Results
  private readonly resultFiles: Map<string, FileNode> = new Map()
  private currentSettings: any = null
  private lastScannedFile = ''

  // -----------------
  // Public API
  // -----------------

  async start(payload: ScanStartPayload): Promise<void> {
    if (this.session?.state === 'SCANNING') return

    this.currentSettings = payload.settings
    this.session = {
      id: payload.sessionId,
      startedAt: new Date().toISOString(),
      state: 'IDLE',
      duplicates: [], largeFiles: [], staleFiles: [], junkFiles: [], emptyFolders: [], files: []
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
    this.activeWorkers = 0; this.processedFiles = 0; this.processedBytes = 0;
    this.processedHashes = 0; this.processedOcrDocs = 0;
    
    this.dirQueue.clear()
    this.hashQueueIds.clear()
    this.ocrQueueIds.clear()
    this.aiQueue.clear()
    this.delayedHtmlFiles = [] // Reset HTML buffer
    this.resultFiles.clear()
  }

  private async initializeWorkers(): Promise<void> {
    this.terminateWorkers()

    let workerPath = path.join(__dirname, 'worker.js')
    if (app.isPackaged) {
      workerPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'dist', 'main', 'worker.js')
      try { await fs.access(workerPath) } catch { workerPath = path.join(__dirname, 'worker.js') }
    }

    const readyPromises: Promise<void>[] = []
    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
      const readyPromise = new Promise<void>((resolve) => {
        const worker = new Worker(workerPath)
        worker.on('message', (msg: WorkerResponse) => {
          this.handleWorkerMessage(i, msg)
          if (msg.type === WorkerMessageType.RES_READY) resolve()
        })
        this.workers.push(worker)
      })
      readyPromises.push(readyPromise)
    }
    await Promise.all(readyPromises)
  }

  private terminateWorkers(): void {
    for (const worker of this.workers) {
      try {
        worker.postMessage({ type: WorkerMessageType.CMD_TERMINATE })
        void worker.terminate()
      } catch (err) { logger.error('Error terminating worker', err) }
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

    // Get top 10 largest files for live streaming
    const liveLargeFiles = [...this.session.largeFiles]
      .sort((a, b) => b.sizeBytes - a.sizeBytes)
      .slice(0, 10)

    // Get last 5 flagged files
    // Note: recentFlaggedFiles needs to be restored if we want this feature
    // For now passing empty to match current state or restore logic
    const liveFlaggedFiles: FileNode[] = [] 

    // Generate live AI insight
    const liveInsight = ''

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

  // -----------------
  // Work Dispatching
  // -----------------

  private processQueue(): void {
    if (!this.session || this.session.state !== 'SCANNING') return

    const noWorkLeft = 
      this.dirQueue.isEmpty && 
      this.hashQueueIds.isEmpty && 
      this.ocrQueueIds.isEmpty && 
      this.activeWorkers === 0

    if (noWorkLeft) {
      if (this.session.duplicates.length === 0 && this.processedFiles > 0) {
        void this.finalizeScan()
      } else {
        this.terminateWorkers()
        this.updateState('COMPLETED', true)
        void this.processAiQueue()
      }
      return
    }

    for (let i = 0; i < this.workers.length; i++) {
      if (!this.workerReadyState[i]) continue

      // 1. Dirs
      const dir = this.dirQueue.dequeue()
      if (dir) {
        this.dispatchToWorker(i, {
          type: WorkerMessageType.CMD_SCAN_DIR,
          path: dir,
          exclusions: this.currentSettings?.excludePaths || []
        })
        continue
      }

      // 2. Hashes
      const hashId = this.hashQueueIds.dequeue()
      if (hashId) {
        const file = this.resultFiles.get(hashId)
        if (file) {
          this.dispatchToWorker(i, { type: WorkerMessageType.CMD_HASH_FILE, id: file.id, filePath: file.path })
        }
        continue
      }

      // 3. OCR
      const ocrId = this.ocrQueueIds.dequeue()
      if (ocrId) {
        const file = this.resultFiles.get(ocrId)
        if (file) {
          this.dispatchToWorker(i, { type: WorkerMessageType.CMD_OCR_FILE, id: file.id, filePath: file.path })
        }
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
    }
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

    const validDirs = res.dirs
    if (validDirs.length > 0) this.dirQueue.enqueue(...validDirs)

    for (const f of res.files) {
      if (this.shouldIgnore(f.path)) continue

      this.resultFiles.set(f.id, f)
      this.processedFiles++
      this.processedBytes += f.sizeBytes
      this.lastScannedFile = f.path
      
      if (f.sizeBytes > LARGE_FILE_BYTES) this.session.largeFiles.push(f)

      f.tags = tagEngine.analyze(f)

      const ext = path.extname(f.name).toLowerCase()

      // 1. Handle HTML specially (Stall Prevention Rule)
      if (ext === '.html' || ext === '.htm') {
        this.delayedHtmlFiles.push(f)
      } 
      // 2. Queue other indexable files normally
      else if (AI_INDEXABLE_EXTENSIONS.has(ext)) {
        this.aiQueue.enqueue(f)
      }

      if (this.currentSettings?.enableOcr && OCR_IMAGE_EXTENSIONS.has(ext)) {
        this.ocrQueueIds.enqueue(f.id)
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
    if (file) {
      file.metadata = { ...file.metadata, text: res.text }
      
      const newTags = tagEngine.analyze(file)
      const unique = new Set([...(file.tags || []), ...newTags])
      file.tags = Array.from(unique)

      this.aiQueue.enqueue(file)
    }
    this.processedOcrDocs++
    this.updateState('SCANNING')
  }

  private shouldIgnore(filePath: string): boolean {
    const settingsExcludes = this.currentSettings?.excludePaths ?? []
    const basename = path.basename(filePath)
    if (settingsExcludes.includes(basename)) return true
    return false
  }

  // -----------------
  // AI & Finalization
  // -----------------

  private async processAiQueue(): Promise<void> {
    if (this.isProcessingAi || this.aiQueue.isEmpty) return
    this.isProcessingAi = true

    try {
      const file = this.aiQueue.dequeue()
      if (file) {
        await aiService.indexFile(file)
        if (file.metadata && file.metadata.text) {
             delete file.metadata.text
        }
      }
    } catch (err) { logger.error('AI index failed', err) } 
    finally {
      this.isProcessingAi = false
      if (!this.aiQueue.isEmpty) {
        setImmediate(() => void this.processAiQueue())
      }
    }
  }

  private async finalizeScan(): Promise<void> {
    // 1. Process the delayed HTML files based on heuristic
    this.processDelayedHtmlFiles()

    // 2. Identify Hashing Candidates
    if (this.processedHashes === 0 && this.resultFiles.size > 0) {
      const candidates = this.identifyHashCandidates()
      if (candidates.length > 0) {
        this.hashQueueIds.clear()
        this.hashQueueIds.enqueue(...candidates.map((f) => f.id))
        this.processQueue()
        return
      }
    }

    await this.buildDuplicateClusters()
    await aiService.saveDb().catch(err => logger.error('Failed to save DB', err))

    logger.info('Scan complete.')
    this.updateState('COMPLETED', true)
    this.terminateWorkers()
    void this.processAiQueue()
  }

  /**
   * HEURISTIC: Only index HTML files that look like copies/versions of others.
   * e.g., "report.html" and "report (1).html"
   */
  private processDelayedHtmlFiles(): void {
    logger.info(`Analyzing ${this.delayedHtmlFiles.length} HTML files for candidate groups...`)
    
    // Normalize: remove " (1)", " - Copy", " 2", etc.
    const getCanonicalName = (name: string) => {
      const base = name.replace(/\.[^/.]+$/, "") // strip extension
      // Regex to strip common copy suffixes: " (1)", " 1", " - Copy"
      return base.replace(/(\s*[\(\-]?\s*(copy|\d+)\s*[\)]?)+$/i, '').trim().toLowerCase()
    }

    const groups = new Map<string, FileNode[]>()

    for (const f of this.delayedHtmlFiles) {
      const canonical = getCanonicalName(f.name)
      // Group by canonical name. 
      // Note: We group globally. If you only want duplicates within the same folder,
      // prepend f.path's directory to the key. Assuming global for now as user didn't specify.
      if (!groups.has(canonical)) groups.set(canonical, [])
      groups.get(canonical)!.push(f)
    }

    let queuedCount = 0
    for (const group of groups.values()) {
      if (group.length > 1) {
        // We have a group (e.g. "report", "report (1)")
        // Check date condition: "Same or similar created or modified date"
        // We'll Sort by mtime, and if ANY two files are close, we index the WHOLE group
        // (Conservative approach: if it looks like a cluster of copies, index them all so we can diff them).
        
        const sorted = group.sort((a, b) => (a.mtimeMs || 0) - (b.mtimeMs || 0))
        let hasSimilarDates = false
        
        for (let i = 0; i < sorted.length - 1; i++) {
            const t1 = sorted[i].mtimeMs || 0
            const t2 = sorted[i+1].mtimeMs || 0
            // Threshold: 60 seconds? User said "same or similar".
            // If copied via FS, mtime is usually preserved (identical). 
            // If downloaded sequentially, might differ by seconds.
            if (Math.abs(t2 - t1) < 60000) { 
                hasSimilarDates = true
                break
            }
        }

        if (hasSimilarDates) {
            // These look like valid duplicate candidates. Index them!
            for (const f of group) {
                this.aiQueue.enqueue(f)
                queuedCount++
            }
        }
      }
    }
    
    logger.info(`Queued ${queuedCount} HTML files for AI processing based on heuristics.`)
    this.delayedHtmlFiles = [] // clear memory
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

    // Semantic Deduplication (now efficient and offloaded)
    try {
        const { deduplicationService } = await import('./deduplication-service')
        const semantic = await deduplicationService.findSemanticDuplicates(this.session.files)
        if (semantic.length > 0) this.session.duplicates.push(...semantic)
    } catch (err) { logger.error('Semantic dedupe failed', err) }
  }

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

  // API Methods
  async getResults(sessionId: string): Promise<ScanSession | null> {
    if (this.session && this.session.id === sessionId) {
      return this.session
    }
    return null
  }
}

export const scanService = new ScanService()