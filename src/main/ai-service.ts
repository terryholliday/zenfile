import { create, insert, remove, search, load, save, type Orama } from '@orama/orama'
import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { Worker } from 'worker_threads'
import { FileNode } from '../shared/types'
import { logger } from './logger'
import type { AiWorkerCommand, AiWorkerResponse } from './ai.worker'

export class AiService {
  private static instance: AiService
  private db: Orama<any> | null = null
  private worker: Worker | null = null
  private initPromise: Promise<void> | null = null
  private pendingRequests = new Map<
    string,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >()
  private embeddingCache = new Map<string, number[]>()
  private clusterRequest: { resolve: (val: any) => void; reject: (err: any) => void } | null = null

  private constructor() {}

  static getInstance(): AiService {
    if (!AiService.instance) AiService.instance = new AiService()
    return AiService.instance
  }

  // FIX: Expose cache clearing
  clearCache(): void {
    this.embeddingCache.clear()
    logger.info('AI Embedding cache cleared')
  }

  async initialize(): Promise<void> {
    if (this.worker && this.db) return
    if (this.initPromise) return this.initPromise

    this.initPromise = this._initializeInternal().finally(() => {
      this.initPromise = null
    })
    return this.initPromise
  }

  private async _initializeInternal(): Promise<void> {
    try {
      logger.info('Initializing AI Service & Worker...')

      const isDev = !app.isPackaged
      const resourcePath = process.resourcesPath || ''
      const workerPath = isDev
        ? path.join(__dirname, 'ai.worker.js')
        : path.join(resourcePath, 'app.asar.unpacked', 'out', 'main', 'ai.worker.js')

      this.worker = new Worker(workerPath)

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          logger.error(`AI Worker crashed with code ${code}. Restarting...`)
          this.worker = null
          this.initPromise = null
        }
      })

      this.worker.on('message', (msg: AiWorkerResponse) => this.handleWorkerMessage(msg))
      this.postToWorker({ type: 'INIT' })

      const dbPath = path.join(app.getPath('userData'), 'zenfile-vectors.json')
      try {
        const data = await fs.readFile(dbPath, 'utf-8')
        this.db = await create({
          schema: { id: 'string', path: 'string', content: 'string', embedding: 'vector[384]' }
        })
        await load(this.db, JSON.parse(data))
      } catch {
        this.db = await create({
          schema: { id: 'string', path: 'string', content: 'string', embedding: 'vector[384]' }
        })
      }
    } catch (err: any) {
      logger.error('Failed to initialize AI Service', err)
      throw err
    }
  }

  private postToWorker(cmd: AiWorkerCommand) {
    if (!this.worker) throw new Error('AI Worker not initialized')
    this.worker.postMessage(cmd)
  }

  private handleWorkerMessage(msg: AiWorkerResponse) {
    switch (msg.type) {
      case 'EMBED_RES': {
        const req = this.pendingRequests.get(msg.id)
        if (req) {
          req.resolve(msg.embedding)
          this.pendingRequests.delete(msg.id)
        }
        break
      }
      case 'SUMMARIZE_RES': {
        const req = this.pendingRequests.get(msg.id)
        if (req) {
          req.resolve(msg.summary)
          this.pendingRequests.delete(msg.id)
        }
        break
      }
      case 'CLUSTER_RES': {
        if (this.clusterRequest) {
          this.clusterRequest.resolve(msg.clusters)
          this.clusterRequest = null
        }
        break
      }
      case 'ERROR': {
        if (msg.id) {
          const req = this.pendingRequests.get(msg.id)
          if (req) {
            req.reject(new Error(msg.error))
            this.pendingRequests.delete(msg.id)
          }
        } else if (this.clusterRequest) {
          this.clusterRequest.reject(new Error(msg.error))
          this.clusterRequest = null
        }
        break
      }
    }
  }

  async generateEmbedding(text: string, fileId?: string): Promise<number[]> {
    if (!this.worker) await this.initialize()
    if (fileId && this.embeddingCache.has(fileId)) return this.embeddingCache.get(fileId)!

    const reqId = fileId || `req_${Date.now()}_${Math.random()}`
    return new Promise<number[]>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject })
      this.postToWorker({ type: 'EMBED', id: reqId, text })
    }).then((vec) => {
      if (fileId) this.embeddingCache.set(fileId, vec)
      return vec
    })
  }

  async indexFile(file: FileNode): Promise<void> {
    if (!this.db) await this.initialize()
    const textToEmbed = `${file.name} ${file.tags.join(' ')} ${file.metadata?.text || ''}`.trim()
    if (!textToEmbed) return

    try {
      const embedding = await this.generateEmbedding(textToEmbed, file.id)
      try {
        await remove(this.db!, file.id)
      } catch {}
      await insert(this.db!, {
        id: file.id,
        path: file.path,
        content: textToEmbed.substring(0, 500),
        embedding: embedding
      })
    } catch (err: any) {
      logger.error(`Failed to index file ${file.name}`, err)
    }
  }

  async saveDb(): Promise<void> {
    if (!this.db) return
    const dbPath = path.join(app.getPath('userData'), 'zenfile-vectors.json')
    const data = await save(this.db)
    await fs.writeFile(dbPath, JSON.stringify(data))
  }

  async computeClusters(
    items: { id: string; vec: number[] }[],
    threshold = 0.95
  ): Promise<string[][]> {
    if (!this.worker) await this.initialize()
    return new Promise<string[][]>((resolve, reject) => {
      if (this.clusterRequest) {
        reject(new Error('Clustering in progress'))
        return
      }
      this.clusterRequest = { resolve, reject }
      this.postToWorker({ type: 'CLUSTER', items, threshold })
    })
  }

  async generateSummary(text: string): Promise<string> {
    if (!this.worker) await this.initialize()
    const reqId = `sum_${Date.now()}_${Math.random()}`
    return new Promise<string>((resolve, reject) => {
      this.pendingRequests.set(reqId, { resolve, reject })
      this.postToWorker({ type: 'SUMMARIZE', id: reqId, text })
    })
  }

  async search(query: string, limit = 10): Promise<any[]> {
    if (!this.db) await this.initialize()
    try {
      const result = await search(this.db!, {
        term: query,
        limit
      })
      return result.hits.map((h) => h.document)
    } catch (err) {
      logger.error('Search failed', err)
      return []
    }
  }
}

export const aiService = AiService.getInstance()
