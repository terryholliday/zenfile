import { FileNode, DuplicateCluster } from '../shared/types'
import { aiService } from './ai-service'
import { logger } from './logger'
import { promises as fs } from 'fs'

// Only these extensions can be safely read as UTF-8 text
const PLAINTEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'ts',
  'tsx',
  'js',
  'jsx',
  'py',
  'java',
  'c',
  'cpp',
  'h',
  'cs',
  'go',
  'rs',
  'php',
  'rb',
  'html',
  'css',
  'scss',
  'xml',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg'
])

export class DeduplicationService {
  private static instance: DeduplicationService

  private constructor() {}

  static getInstance(): DeduplicationService {
    if (!DeduplicationService.instance) {
      DeduplicationService.instance = new DeduplicationService()
    }
    return DeduplicationService.instance
  }

  private getCosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i]
      normA += vecA[i] * vecA[i]
      normB += vecB[i] * vecB[i]
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
  }

  async findSemanticDuplicates(files: FileNode[]): Promise<DuplicateCluster[]> {
    logger.info(`Starting Semantic Deduplication on ${files.length} files`)

    const candidates = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase() || ''
      const isPlaintext = PLAINTEXT_EXTENSIONS.has(ext)
      const hasOcrText = !!f.metadata?.text
      return (isPlaintext || hasOcrText) && f.sizeBytes > 50 && f.sizeBytes < 1024 * 1024
    })

    if (candidates.length < 2) return []

    // 1. Generate Embeddings (Batched)
    const embeddings: { id: string; vec: number[] }[] = []
    const BATCH_SIZE = 5
    
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        // Yield to event loop every few batches to keep UI responsive
        if (i % 20 === 0) await new Promise(r => setImmediate(r))
        
        const batch = candidates.slice(i, i + BATCH_SIZE)
        await Promise.all(batch.map(async (file) => {
            try {
                let content: string | null = null
                const ext = file.name.split('.').pop()?.toLowerCase() || ''

                if (PLAINTEXT_EXTENSIONS.has(ext)) {
                    content = await fs.readFile(file.path, 'utf-8')
                } else if (file.metadata?.text) {
                    content = file.metadata.text
                }

                if (!content) return

                const snippet = content.substring(0, 1000)
                if (!snippet.trim()) return

                const vec = await aiService.generateEmbedding(snippet, file.id)
                embeddings.push({ id: file.id, vec })
            } catch (err) { /* ignore */ }
        }))
    }

    // 2. Compare Vectors (O(N^2))
    const clusters: DuplicateCluster[] = []
    const visited = new Set<string>()

    for (let i = 0; i < embeddings.length; i++) {
      // RESPONSIVENESS FIX: Yield every 50 iterations to prevent freezing
      if (i % 50 === 0) await new Promise(resolve => setImmediate(resolve))

      if (visited.has(embeddings[i].id)) continue

      const currentCluster: FileNode[] = [candidates.find((f) => f.id === embeddings[i].id)!]
      visited.add(embeddings[i].id)

      for (let j = i + 1; j < embeddings.length; j++) {
        if (visited.has(embeddings[j].id)) continue

        const similarity = this.getCosineSimilarity(embeddings[i].vec, embeddings[j].vec)
        if (similarity > 0.95) {
          const match = candidates.find((f) => f.id === embeddings[j].id)!
          currentCluster.push(match)
          visited.add(embeddings[j].id)
        }
      }

      if (currentCluster.length > 1) {
        clusters.push({ 
            hash: `semantic-${Date.now()}-${i}`, 
            files: currentCluster, 
            type: 'SEMANTIC' 
        })
      }
    }

    return clusters
  }
}

export const deduplicationService = DeduplicationService.getInstance()
