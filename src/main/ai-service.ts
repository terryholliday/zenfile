import { pipeline, Pipeline } from '@xenova/transformers'
import { create, insert, search, type Orama } from '@orama/orama'
import { FileNode } from '../shared/types'
import { logger } from './logger'

interface IndexedDocument {
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

  async initialize() {
    if (this.model && this.db) return
    if (this.isInitializing) return

    this.isInitializing = true
    logger.info('Initializing AI Service...')

    try {
      // 1. Load Model (Lazy load)
      // Using a small, efficient model for local embeddings
      this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true, // drastically reduces size
      })

      // 2. Initialize Vector DB
      this.db = await create({
        schema: {
          id: 'string',
          path: 'string',
          content: 'string',
          embedding: 'vector[384]', // 384 dims for all-MiniLM-L6-v2
        },
      })

      logger.info('AI Service Initialized Successfully')
    } catch (err: any) {
      logger.error('Failed to initialize AI Service', { error: err.message })
    } finally {
      this.isInitializing = false
    }
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.model) await this.initialize()
    if (!this.model) throw new Error('AI Model Failed to Load')

    const output = await this.model(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data) // Convert Tensor to simple array
  }

  async indexFile(file: FileNode) {
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
    const results = await search<IndexedDocument>(this.db!, {
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
