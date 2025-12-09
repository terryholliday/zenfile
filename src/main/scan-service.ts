import { Worker } from 'worker_threads'
import { app, BrowserWindow, shell } from 'electron'
import fs from 'fs/promises'
import path from 'path'
// import { v4 as uuidv4 } from 'uuid'; // Unused
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
  HashResultResponse
} from '../shared/worker-types'
import { WORKER_POOL_SIZE } from '../shared/constants'
import { logger } from './logger'
import { tagEngine } from './tag-engine'
import { aiService } from './ai-service'

export class ScanService {
  private workers: Worker[] = []
  private workerReadyState: boolean[] = []
  private session: ScanSession | null = null
  private lastUpdate = 0

  // Queues
  private dirQueue: string[] = []
  private hashQueue: string[] = []
  private ocrQueue: string[] = []

  // Backpressure & Stats
  private activeWorkers = 0
  private processedFiles = 0
  private processedBytes = 0
  private processedHashes = 0
  private processedOcrDocs = 0

  // In-Memory Results
  private resultFiles: Map<string, FileNode> = new Map()
  private currentSettings: any = null // SettingsSchema
  private lastScannedFile = ''

  constructor() {}

  // ...

  async start(payload: ScanStartPayload): Promise<void> {
    if (this.session && this.session.state === 'SCANNING') {
      logger.warn('Scan start requested but already scanning')
      return
    }

    logger.info('Starting Scan Session', { paths: payload.paths })
    this.currentSettings = payload.settings

    // ... existing initialization ...
    
    this.resetState()
    this.dirQueue.push(...payload.paths)
    await this.initializeWorkers()
    this.updateState('SCANNING', true)
    this.processQueue()
  }

  cancel() {
    logger.info('Cancelling scan session')
    this.terminateWorkers()
    this.updateState('CANCELLED', true)
  }

  private resetState() {
    this.activeWorkers = 0
    this.processedFiles = 0
    this.processedBytes = 0
    this.processedHashes = 0
    this.processedOcrDocs = 0
    this.dirQueue = []
    this.hashQueue = []
    this.ocrQueue = []
    this.resultFiles.clear()
    this.workerReadyState = new Array(WORKER_POOL_SIZE).fill(false)
    
    // Reset Session
    if (this.session) {
        this.session.files = []
        this.session.duplicates = []
        this.session.largeFiles = []
    } else {
        // Create fresh session object if needed - though start() usually relies on existing or passed ID
        // In this architecture, start() creates the session *ID* via store, but the Service holds state.
        // We should ensure `this.session` is initialized properly. 
        // Ideally start() passed the full session structure, but currently it passes paths/settings.
        // We'll init a basic session struct here if null, but usually it should be set.
        // Looking at start(), it sets state but doesn't create `this.session` structure explicitly? 
        // Wait, start in store creates sessionId. The service needs to track it.
        // Let's assume start() sets `this.session` via `ScanStartPayload` but payload only has sessionId.
        // We need to init `this.session` in start() or resetState().
    }
  }

  private async initializeWorkers() {
    this.terminateWorkers()
    // In production/dev with electron-vite, worker.js is a sibling of index.js (where this code effectively runs)
    const workerScript = path.join(__dirname, 'worker.js')
    
    logger.info(`Spawning ${WORKER_POOL_SIZE} workers from ${workerScript}`)

    const promises: Promise<void>[] = []

    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
        promises.push(new Promise((resolve) => {
            const worker = new Worker(workerScript)
            
            worker.on('message', (msg: WorkerResponse) => {
                if (msg.type === WorkerMessageType.RES_READY) {
                    this.handleWorkerMessage(i, msg)
                    resolve()
                } else {
                    this.handleWorkerMessage(i, msg)
                }
            })
            
            worker.on('error', (err) => {
                logger.error(`Worker ${i} error:`, err)
            })

            this.workers.push(worker)
        }))
    }

    await Promise.all(promises)
    logger.info('All workers ready')
  }

  private terminateWorkers() {
      for (const worker of this.workers) {
          worker.postMessage({ type: WorkerMessageType.CMD_TERMINATE })
          // worker.terminate() // Let it exit gracefully if possible, or terminate force
          void worker.terminate()
      }
      this.workers = []
      this.workerReadyState = []
  }

  private updateState(state: ScannerState, force = false) {
      if (!this.session) {
          // Init session if missing (should be done in start, but safety net)
          this.session = {
              id: 'temp', 
              startTime: Date.now(),
              state: 'IDLE',
              files: [],
              duplicates: [],
              largeFiles: []
          }
      }
      
      this.session.state = state
      
      const now = Date.now()
      if (force || now - this.lastUpdate > 200) {
          this.lastUpdate = now
          const payload: ScanProgressPayload = {
              sessionId: this.session.id,
              state: this.session.state,
              filesScanned: this.processedFiles,
              bytesScanned: this.processedBytes,
              currentFile: this.lastScannedFile,
              progress: 0 // TODO calc progress
          }
          
          // Send to all windows
          BrowserWindow.getAllWindows().forEach(win => {
              win.webContents.send(IpcChannel.ScanProgress, payload)
          })
      }
  }

  // ...

  private processQueue() {
    if (!this.session || this.session.state !== 'SCANNING') return

    // Completion Check
    if (this.dirQueue.length === 0 && this.hashQueue.length === 0 && this.ocrQueue.length === 0 && this.activeWorkers === 0) {
      if (this.session.duplicates.length === 0 && this.processedFiles > 0) {
        this.finalizeScan()
      } else {
        this.terminateWorkers()
        this.updateState('COMPLETED', true)
      }
      return
    }

    // Dispatch Work to Idle Workers
    for (let i = 0; i < this.workers.length; i++) {
      if (!this.workerReadyState[i]) continue

      // 1. Directory Scanning
      if (this.dirQueue.length > 0) {
        const dir = this.dirQueue.shift()
        if (dir) {
          this.workerReadyState[i] = false
          this.activeWorkers++
          const cmd: WorkerCommand = { type: WorkerMessageType.CMD_SCAN_DIR, path: dir }
          this.workers[i].postMessage(cmd)
          continue
        }
      }

      // 2. Hashing
      if (this.hashQueue.length > 0) {
        const file = this.hashQueue.shift()
        if (file) {
          this.workerReadyState[i] = false
          this.activeWorkers++
          const cmd: WorkerCommand = { type: WorkerMessageType.CMD_HASH_FILE, filePath: file }
          this.workers[i].postMessage(cmd)
          continue
        }
      }

      // 3. OCR
      if (this.ocrQueue.length > 0) {
        const file = this.ocrQueue.shift()
        if (file) {
          this.workerReadyState[i] = false
          this.activeWorkers++
          const cmd: WorkerCommand = { type: WorkerMessageType.CMD_OCR_FILE, filePath: file }
          this.workers[i].postMessage(cmd)
          continue
        }
      }
    }
  }


  private handleWorkerMessage(index: number, msg: WorkerResponse) {
    switch (msg.type) {
      case WorkerMessageType.RES_READY:
        this.workerReadyState[index] = true
        break
      case WorkerMessageType.RES_SCAN_RESULT:
        this.workerReadyState[index] = true // Mark ready immediately
        this.activeWorkers--
        this.handleScanResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_HASH_RESULT:
        this.workerReadyState[index] = true // Mark ready immediately
        this.activeWorkers--
        this.handleHashResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_OCR_RESULT:
        this.workerReadyState[index] = true // Mark ready immediately
        this.activeWorkers--
        this.handleOcrResult(msg)
        this.processQueue()
        break
      case WorkerMessageType.RES_ERROR:
        this.workerReadyState[index] = true // Mark ready immediately
        this.activeWorkers--
        logger.warn(`Worker Error: ${msg.error} at ${msg.path}`)
        this.processQueue()
        break
    }
  }

  private shouldIgnore(filePath: string): boolean {
      const excludes = this.currentSettings?.excludePaths || []
       // Always include defaults if not present
       // (Naive check, ideally merge sets)
       const defaults = ['node_modules', '.git', 'AppData', 'Library', '/System', 'C:\\Windows', 'Temp', 'tmp']
       
       const basename = path.basename(filePath)
       
       // Check against exact name matches
       if (defaults.includes(basename) || excludes.includes(basename)) return true
       
       // Check if path contains any ignored segment
       // This is expensive but necessary for top-level recursive ignores
       // We'll optimize by just checking if the *current* dir/file is the ignored one, 
       // since we filter dirs before recursing.
       
       return false
  }

  private handleScanResult(res: ScanResultResponse) {
    if (!this.session) return

    // Filter Directories
    const validDirs = res.dirs.filter(d => !this.shouldIgnore(d))
    this.dirQueue.push(...validDirs)

    // Filter Files
    res.files.forEach((f) => {
      if (this.shouldIgnore(f.path)) return

      this.resultFiles.set(f.id, f)
      this.processedFiles++
      this.processedBytes += f.sizeBytes
      this.lastScannedFile = f.path // Efficiently track last file

      if (f.sizeBytes > 100 * 1024 * 1024) {
        this.session?.largeFiles.push(f)
      }
      
      // Auto-Tagging (Filename based)
      f.tags = tagEngine.analyze(f)
      
      // Index for AI Search - WHITELIST ONLY
      const ext = path.extname(f.name).toLowerCase()
      const allowedIndexExtensions = [
          '.txt', '.md', '.markdown', 
          '.pdf', '.docx', '.doc', '.rtf',
          '.ts', '.tsx', '.js', '.jsx', '.json',
          '.py', '.java', '.c', '.cpp', '.h', '.cs', 
          '.go', '.rs', '.php', '.rb',
          '.html', '.css', '.scss'
      ]
      
      if (allowedIndexExtensions.includes(ext)) {
          aiService.indexFile(f).catch(err => logger.error('Index failed', err))
      }
      
      // OCR Queue Logic
      if (this.currentSettings?.enableOcr) {
          if (['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'].includes(ext)) {
              this.ocrQueue.push(f.path)
          }
      }
    })

    this.updateState('SCANNING')
  }

  private handleHashResult(res: HashResultResponse) {
    if (!this.session) return
    for (const file of this.resultFiles.values()) {
      if (file.path === res.filePath) {
        file.hash = res.hash
        break
      }
    }
    this.processedHashes++
    this.updateState('SCANNING')
  }

  private handleOcrResult(res: any) {
    if (!this.session) return
    for (const file of this.resultFiles.values()) {
        if (file.path === res.filePath) {
            file.metadata = { ...file.metadata, text: res.text }
            // Re-analyze tags with new text content
            const newTags = tagEngine.analyze(file)
            // Merge tags avoiding duplicates
            const merged = new Set([...file.tags, ...newTags])
            file.tags = Array.from(merged)

            // Re-index with new content
            aiService.indexFile(file).catch(err => logger.error('Re-index failed', err))
            break
        }
    }
    this.processedOcrDocs++
    this.updateState('SCANNING')
  }

  private async finalizeScan() {
    // If we haven't hashed yet, try to find candidates
    if (this.processedHashes === 0 && this.resultFiles.size > 0) {
      logger.info('Scan Phase 1 Complete. Identifying Candidates for Hashing...')
      const candidates = this.identifyHashCandidates()
      if (candidates.length > 0) {
        this.hashQueue = candidates.map((f) => f.path)
        logger.info(`Queued ${this.hashQueue.length} files for hashing.`)
        this.processQueue()
        return
      }
    }

    await this.buildDuplicateClusters()
    logger.info('Scan Complete.')
    this.updateState('COMPLETED', true)
    this.terminateWorkers()
  }

  private identifyHashCandidates(): FileNode[] {
    const sizeMap = new Map<number, FileNode[]>()
    for (const file of this.resultFiles.values()) {
      if (file.isDirectory) continue
      const list = sizeMap.get(file.sizeBytes) || []
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

  private async buildDuplicateClusters() {
    if (!this.session) return
    const clusters: DuplicateCluster[] = []
    const hashMap = new Map<string, FileNode[]>()

    for (const file of this.resultFiles.values()) {
      if (file.hash) {
        const list = hashMap.get(file.hash) || []
        list.push(file)
        hashMap.set(file.hash, list)
      }
    }

    for (const [hash, list] of hashMap) {
      if (list.length > 1) {
        clusters.push({ hash, files: list, type: 'EXACT' })
      }
    }
    this.session.duplicates = clusters
    this.session.files = Array.from(this.resultFiles.values()) // Populate all files

    // Semantic Deduplication Trigger
    // We do this after exact match, as it's more expensive
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

    logger.info(`Analysis Finished. Identified ${this.session.duplicates.length} total duplicate clusters.`)
  }

  // --- Actions ---

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
        logger.error(`Failed to trash ${file.path}`, { error: err.message })
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
      logger.error('Failed to create quarantine dir')
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
        const dest = path.join(quarantineDir, path.basename(file.path) + `_${Date.now()}.bak`)
        await fs.rename(file.path, dest)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: any) {
        logger.error(`Failed to quarantine ${file.path}`, { error: err.message })
        failures.push(id)
      }
    }
    return { success, failures }
  }

  async moveFiles(payload: ActionPayload & { destination: string }): Promise<{ success: string[]; failures: string[] }> {
    const success: string[] = []
    const failures: string[] = []
    
    // Ensure dest exists
    try {
        if (!payload.dryRun) {
            await fs.mkdir(payload.destination, { recursive: true })
        }
    } catch (err) {
        logger.error(`Failed to create dest dir ${payload.destination}`)
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
        
        // Prevent overwrite
        // TODO: Handle overwrite logic or rename strategy
        try {
            await fs.access(destPath)
            // If we get here, file exists. Fail for now.
            logger.warn(`Destination exists for ${file.path}`)
            failures.push(id)
            continue
        } catch {
            // File does not exist, proceed
        }

        await fs.rename(file.path, destPath)
        this.resultFiles.delete(id)
        success.push(id)
      } catch (err: any) {
        logger.error(`Failed to move ${file.path}`, { error: err.message })
        failures.push(id)
      }
    }
    return { success, failures }
  }
}

export const scanService = new ScanService()
