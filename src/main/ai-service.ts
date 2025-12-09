import { create, insert, search, load, save, type Orama } from '@orama/orama'
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
  private pendingRequests = new Map<
    string,
    { resolve: (val: number[]) => void; reject: (err: Error) => void }
  >()
  private isInitializing = false

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

  async initialize(): Promise<void> {
    if (this.worker && this.db) return
    if (this.isInitializing) return

    this.isInitializing = true
    logger.info('Initializing AI Service & Worker...')

    try {
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
    } finally {
      this.isInitializing = false
    }
  }

  // --- Worker Communication ---

  private postToWorker(cmd: AiWorkerCommand): void {
    if (!this.worker) throw new Error('AI Worker not initialized')
    this.worker.postMessage(cmd)
  }

  private handleWorkerMessage(msg: AiWorkerResponse): void {
    switch (msg.type) {
      case 'INIT_DONE':
        logger.info('AI Worker initialized and ready')
        break

      case 'EMBED_RES': {
        const req = this.pendingRequests.get(msg.id)
        if (req) {
          req.resolve(msg.embedding)
          this.pendingRequests.delete(msg.id)
        }
        break
      }

      case 'SUMMARIZE_RES':
        // For now, summarization is sync - can extend with request tracking
        break

      case 'ERROR': {
        if (msg.id) {
          const req = this.pendingRequests.get(msg.id)
          if (req) {
            req.reject(new Error(msg.error))
            this.pendingRequests.delete(msg.id)
          }
        }
        logger.error('AI Worker reported error', { error: msg.error })
        break
      }
    }
  }

  // --- Public API ---

  async generateEmbedding(text: string, fileId?: string): Promise<number[]> {
    if (!this.worker) await this.initialize()

    // Check cache first (critical for deduplication efficiency!)
    if (fileId && this.embeddingCache.has(fileId)) {
      return this.embeddingCache.get(fileId)!
    }

    const reqId = fileId || `req_${Date.now()}_${Math.random().toString(36).slice(2)}`

    return new Promise<number[]>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject })
      this.postToWorker({ type: 'EMBED', id: reqId, text })
    }).then((vec) => {
      // Cache the result if we have a file ID
      if (fileId) {
        this.embeddingCache.set(fileId, vec)
      }
      return vec
    })
  }

  async indexFile(file: FileNode): Promise<void> {
    if (!this.db) await this.initialize()

    const textToEmbed = `${file.name} ${file.tags.join(' ')} ${file.metadata?.text || ''}`.trim()
    if (!textToEmbed) return

    try {
      const embedding = await this.generateEmbedding(textToEmbed, file.id)

      await insert(this.db!, {
        id: file.id,
        path: file.path,
        content: textToEmbed.substring(0, 500),
        embedding: embedding
      })
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error(`Failed to index file ${file.name}`, { error: errorMsg })
    }
  }

  async search(query: string): Promise<{ id: string; path: string; score: number }[]> {
    if (!this.db) await this.initialize()

    const queryEmbedding = await this.generateEmbedding(query)

    // Orama vector search
    const results = await search(this.db!, {
      mode: 'vector',
      vector: {
        value: queryEmbedding,
        property: 'embedding'
      },
      similarity: 0.7,
      limit: 10
    })

    return results.hits.map((hit) => ({
      id: hit.document.id as string,
      path: hit.document.path as string,
      score: hit.score
    }))
  }

  // --- Persistence ---

  async saveDb(): Promise<void> {
    if (!this.db) return

    try {
      const dbPath = path.join(app.getPath('userData'), 'zenfile-vectors.json')
      const data = await save(this.db)
      await fs.writeFile(dbPath, JSON.stringify(data))
      logger.info('Vector DB saved to disk')
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logger.error('Failed to save Vector DB', { error: errorMsg })
    }
  }

  // Clear cache (useful on new scan)
  clearCache(): void {
    this.embeddingCache.clear()
    logger.info('Embedding cache cleared')
  }
}

export const aiService = AiService.getInstance()
