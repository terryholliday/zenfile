import { pipeline, Pipeline } from '@xenova/transformers'
import { create, insert, search, type Orama } from '@orama/orama'
import { app } from 'electron'
import path from 'path'
import { FileNode } from '../shared/types'
import { logger } from './logger'

// Type definition for vector storage schema
interface FileSchema {
  id: string
  path: string
  content: string
  embedding: number[]
}

export class AiService {
  private static instance: AiService
  private model: Pipeline | null = null
  private db: Orama<any> | null = null
  private isInitializing = false

  private constructor() {}

  static getInstance(): AiService {
    if (!AiService.instance) {
      AiService.instance = new AiService()
    }
    return AiService.instance
  }

  private summarizer: Pipeline | null = null

  async initialize() {
    if (this.model && this.db && this.summarizer) return
    if (this.isInitializing) return

    this.isInitializing = true
    logger.info('Initializing AI Service...')

    try {
      // 1. Load Embedding Model
      if (!this.model) {
        this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true
        })
      }

      // 2. Load Summarization Model (Lazy load or parallel)
      // Using DistilBART or T5. DistilBART is faster for summarization.
      if (!this.summarizer) {
        this.summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', {
          quantized: true
        })
      }

      // 3. Initialize Vector DB
      if (!this.db) {
        this.db = await create({
          schema: {
            id: 'string',
            path: 'string',
            content: 'string',
            embedding: 'vector[384]'
          }
        })
      }

      logger.info('AI Service Initialized Successfully')
    } catch (err: any) {
      logger.error('Failed to initialize AI Service', { error: err.message })
    } finally {
      this.isInitializing = false
    }
  }

  async generateSummary(text: string): Promise<string> {
    if (!this.summarizer) await this.initialize()
    if (!this.summarizer) throw new Error('Summarizer model failed to load')

    try {
      // Truncate input if too long (rough char count)
      const input = text.substring(0, 4000)
      const result = await this.summarizer(input, {
        max_new_tokens: 100,
        min_new_tokens: 20,
        do_sample: false
      })

      // Result is usually [{ summary_text: "..." }]
      // @ts-ignore
      return result[0]?.summary_text || 'No summary generated.'
    } catch (err: any) {
      logger.error('Summarization failed', err)
      return 'Unable to generate summary.'
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.model) await this.initialize()
    if (!this.model) throw new Error('AI Model Failed to Load')

    const output = await this.model(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data) // Convert Tensor to simple array
  }

  async indexFile(file: FileNode): Promise<void> {
    if (!this.db) await this.initialize()

    const textToEmbed = `${file.name} ${file.tags.join(' ')} ${file.metadata?.text || ''}`.trim()
    if (!textToEmbed) return

    try {
      const embedding = await this.generateEmbedding(textToEmbed)

      await insert(this.db!, {
        id: file.id,
        path: file.path,
        content: textToEmbed.substring(0, 500), // Store snippet
        embedding: embedding
      })
    } catch (err: any) {
      logger.error(`Failed to index file ${file.name}`, { error: err.message })
    }
  }

  async search(query: string) {
    if (!this.db) await this.initialize()

    const queryEmbedding = await this.generateEmbedding(query)

    // Orama vector search
    const results = await search(this.db!, {
      mode: 'vector',
      vector: {
        value: queryEmbedding,
        property: 'embedding'
      },
      similarity: 0.7, // Threshold
      limit: 10
    })

    return results.hits.map((hit) => ({
      id: hit.document.id,
      path: hit.document.path,
      score: hit.score
    }))
  }
}

export const aiService = AiService.getInstance()
