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
    { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }
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

  // ... (Initialization remains same) ...

  // --- Worker Communication ---

  private postToWorker(cmd: AiWorkerCommand): void {
    if (!this.worker) throw new Error('AI Worker not initialized')
    this.worker.postMessage(cmd)
  }

  private handleWorkerMessage(msg: AiWorkerResponse) {
    if (msg.type === 'EMBED_RES' || msg.type === 'ERROR') {
      // @ts-ignore - msg.id exists on these types
      const id = msg.id
      if (id && this.pendingRequests.has(id)) {
        const req = this.pendingRequests.get(id)!
        clearTimeout(req.timer) // Clear timeout
        
        if (msg.type === 'ERROR') req.reject(new Error(msg.error))
        else req.resolve((msg as any).embedding)
        
        this.pendingRequests.delete(id)
      }
    } else if (msg.type === 'SUMMARIZE_RES') {
         // Fix 2: Crash Recovery - restart worker if it crashes
      this.worker?.on('exit', (code) => { // Added '?' for safety, as worker might be null if already crashed
        if (code !== 0) {
          logger.error(`AI Worker crashed with code ${code}. Restarting...`)
          
          // CRITICAL FIX: Reject all pending promises so UI doesn't hang
          for (const [id, req] of this.pendingRequests) {
              req.reject(new Error(`AI Worker crashed while processing ${id}`))
          }
          this.pendingRequests.clear()

          this.worker = null
          this.initPromise = null // Allow re-initialization
        }
      })  
         // Existing summary handling if needed
         this.pendingRequests.forEach((req, key) => {
            if (key.startsWith('sum_')) {
                clearTimeout(req.timer)
                req.resolve(msg.summary)
                this.pendingRequests.delete(key)
            }
         })
    }
  }

  // --- Public API ---

  async generateEmbedding(text: string, fileId?: string): Promise<number[]> {
    if (!this.worker) await this.initialize()
    if (fileId && this.embeddingCache.has(fileId)) return this.embeddingCache.get(fileId)!

    const reqId = fileId || `req_${Date.now()}_${Math.random()}`
    
    return new Promise<number[]>((resolve, reject) => {
      // TIMEOUT PROTECTION
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(reqId)) {
          this.pendingRequests.delete(reqId)
          reject(new Error('AI Request Timed Out'))
        }
      }, 30000) // 30s timeout

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.pendingRequests.set(reqId, { resolve, reject, timer } as any)
      this.postToWorker({ type: 'EMBED', id: reqId, text })
    }).then(vec => {
        if (fileId) this.embeddingCache.set(fileId, vec)
        return vec
    })
  }

  clearCache(): void {
    this.embeddingCache.clear()
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
