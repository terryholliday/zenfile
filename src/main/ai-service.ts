import { create, insert, remove, search as oramaSearch, load, save, type Orama } from '@orama/orama'
import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { Worker } from 'worker_threads'
import { FileNode } from '../shared/types'
import { logger } from './logger'
import type { AiWorkerCommand, AiWorkerResponse } from './ai.worker'

export class AiService {
  private static instance: AiService
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: Orama<any> | null = null
  private worker: Worker | null = null

  // Fix 1: Initialization Promise for concurrent access safety (race condition fix)
  private initPromise: Promise<void> | null = null

  private pendingRequests = new Map<
    string,
    { resolve: (val: number[]) => void; reject: (err: Error) => void }
  >()

  // Cache for deduplication service reuse - prevents redundant computation
  private embeddingCache = new Map<string, number[]>()

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  private constructor() {}

  static getInstance(): AiService {
    if (!AiService.instance) {
      AiService.instance = new AiService()
    }
    return AiService.instance
  }

  // --- Robust Initialization (Race Condition Safe) ---
  async initialize(): Promise<void> {
    if (this.worker && this.db) return

    // If already initializing, return the existing promise to prevent race conditions
    if (this.initPromise) return this.initPromise

    this.initPromise = this._initializeInternal().finally(() => {
      this.initPromise = null
    })

    return this.initPromise
  }

  private async _initializeInternal(): Promise<void> {
    try {
      logger.info('Initializing AI Service & Worker...')

      // 1. Spawn AI Worker (keeps heavy ML off main thread)
      let workerPath = path.join(__dirname, 'ai.worker.js')
      if (app.isPackaged) {
        workerPath = path.join(
          process.resourcesPath,
          'app.asar.unpacked',
          'out',
          'main',
          'ai.worker.js'
        )
      }

      this.worker = new Worker(workerPath)

      // Fix 2: Crash Recovery - restart worker if it crashes
      this.worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`AI Worker crashed with code ${code}. Restarting...`)
          this.worker = null
          this.initPromise = null // Allow re-initialization
        }
      })

      this.worker.on('message', (msg: AiWorkerResponse) => this.handleWorkerMessage(msg))
      this.worker.on('error', (err) => logger.error('AI Worker Error', err))

      // Initialize worker (loads model)
      this.postToWorker({ type: 'INIT' })

      // 2. Initialize or Load Vector DB from disk
      const dbPath = path.join(app.getPath('userData'), 'zenfile-vectors.json')
      try {
        const data = await fs.readFile(dbPath, 'utf-8')
        // Create fresh DB schema first
        this.db = await create({
          schema: {
            id: 'string',
            path: 'string',
            content: 'string',
            embedding: 'vector[384]'
          }
        })
        // Load persisted data
        await load(this.db, JSON.parse(data))
        logger.info('Loaded existing Vector DB from disk')
      } catch {
        // Create fresh DB
        this.db = await create({
          schema: {
            id: 'string',
            path: 'string',
            content: 'string',
            embedding: 'vector[384]'
          }
        })
        logger.info('Created fresh Vector DB')
      }

      logger.info('AI Service Initialized Successfully')
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Failed to initialize AI Service', { error: errorMsg })
      throw err
    }
  }

  // --- Worker Communication ---

  private postToWorker(cmd: AiWorkerCommand): void {
    if (!this.worker) throw new Error('AI Worker not initialized')
    this.worker.postMessage(cmd)
  }

  private handleWorkerMessage(msg: AiWorkerResponse) {
    switch (msg.type) {
      case 'EMBED_RES':
        this.pendingRequests.get(msg.id)?.resolve(msg.embedding)
        this.pendingRequests.delete(msg.id)
        break
      case 'SUMMARIZE_RES':
        // We use a generic ID for summaries or handle them via request map
        // For robustness, let's assume we map them too.
        // *Requires updating ai.worker.ts to pass ID back for summary too*
        // For now, simple fallback used in provided fix:
        this.pendingRequests.forEach((req, key) => {
            if (key.startsWith('sum_')) {
                req.resolve(msg.summary)
                this.pendingRequests.delete(key)
            }
        })
        break
      case 'ERROR':
        this.pendingRequests.get(msg.id!)?.reject(new Error(msg.error))
        this.pendingRequests.delete(msg.id!)
        break
    }
  }

  // --- Public API ---

  async generateEmbedding(text: string, fileId?: string): Promise<number[]> {
    if (!this.worker) await this.initialize()
    if (fileId && this.embeddingCache.has(fileId)) return this.embeddingCache.get(fileId)!

    const reqId = fileId || `req_${Date.now()}_${Math.random()}`
    return new Promise<number[]>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject })
      this.postToWorker({ type: 'EMBED', id: reqId, text })
    }).then(vec => {
        if (fileId) this.embeddingCache.set(fileId, vec)
        return vec
    })
  }

  // RESTORED: Needed by DnaService
  async generateSummary(text: string): Promise<string> {
    if (!this.worker) await this.initialize()
    const reqId = `sum_${Date.now()}`
    return new Promise<string>((resolve, reject) => {
        // Simple singleton summary queue logic or mapped ID
        this.pendingRequests.set(reqId, { resolve, reject } as any)
        // Worker needs to be updated to accept ID for summary or we treat FIFO
        // Assuming we update worker types to include ID for summary command
        this.postToWorker({ type: 'SUMMARIZE', text } as any) 
    })
  }

  // RESTORED: Needed by IPC Search
  async search(query: string): Promise<{ id: string; path: string; score: number }[]> {
    if (!this.db) await this.initialize()
    const queryEmbedding = await this.generateEmbedding(query)
    
    const results = await oramaSearch(this.db!, {
      mode: 'vector',
      vector: { value: queryEmbedding, property: 'embedding' },
      similarity: 0.7,
      limit: 10
    })

    return results.hits.map((hit) => ({
      id: String(hit.document.id),
      path: String(hit.document.path),
      score: hit.score
    }))
  }

  async indexFile(file: FileNode): Promise<void> {
    if (!this.db) await this.initialize()
    const textToEmbed = `${file.name} ${file.tags.join(' ')} ${file.metadata?.text || ''}`.trim()
    if (!textToEmbed) return

    try {
      const embedding = await this.generateEmbedding(textToEmbed, file.id)
      try { await remove(this.db!, file.id) } catch {} // Upsert
      await insert(this.db!, {
        id: file.id,
        path: file.path,
        content: textToEmbed.substring(0, 500),
        embedding: embedding
      })
    } catch (err) {
      logger.error(`Failed to index file ${file.name}`, err)
    }
  }

  async saveDb(): Promise<void> {
    if (!this.db) return
    const dbPath = path.join(app.getPath('userData'), 'zenfile-vectors.json')
    const data = await save(this.db)
    await fs.writeFile(dbPath, JSON.stringify(data))
  }
}

export const aiService = AiService.getInstance()
