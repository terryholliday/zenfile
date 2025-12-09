import { FileNode, DuplicateCluster } from '../shared/types'
import { aiService } from './ai-service'
import { logger } from './logger'
import { promises as fs } from 'fs'

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

    // 1. Filter candidates (text files, meaningful size, not too huge)
    const candidates = files.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return (
        ['txt', 'md', 'json', 'ts', 'js', 'py', 'doc', 'docx', 'pdf'].includes(ext || '') &&
        f.sizeBytes > 50 &&
        f.sizeBytes < 1024 * 1024
      ) // Limit to 1MB for now for speed
    })

    if (candidates.length < 2) return []

    const embeddings: { id: string; vec: number[] }[] = []

    // 2. Generate embeddings
    for (const file of candidates) {
      try {
        // If we already indexed it, we might be able to fetch from DB?
        // For now, let's regenerate to be safe/simple, or fetch if exposed.
        // Actually AiService doesn't expose "getEmbeddingForFile", only search.
        // We'll regenerate. It's local and fast for small batch.

        const content = await fs.readFile(file.path, 'utf-8')
        // Truncate for embedding model limit
        const snippet = content.substring(0, 1000)

        const vec = await aiService.generateEmbedding(snippet)
        embeddings.push({ id: file.id, vec })
      } catch (err) {
        logger.warn(`Failed to embed ${file.name} for dedupe`, err)
      }
    }

    // 3. Compare all pairs (Naive O(n^2) for now)
    // For larger sets, we'd use the Vector DB's clustering capabilities or blocking.
    const clusters: DuplicateCluster[] = []
    const visited = new Set<string>()

    for (let i = 0; i < embeddings.length; i++) {
      if (visited.has(embeddings[i].id)) continue

      const currentCluster: FileNode[] = [candidates.find((f) => f.id === embeddings[i].id)!]
      visited.add(embeddings[i].id)

      for (let j = i + 1; j < embeddings.length; j++) {
        if (visited.has(embeddings[j].id)) continue

        const similarity = this.getCosineSimilarity(embeddings[i].vec, embeddings[j].vec)

        if (similarity > 0.95) {
          // Very strict threshold
          const match = candidates.find((f) => f.id === embeddings[j].id)!
          currentCluster.push(match)
          visited.add(embeddings[j].id)
        }
      }

      if (currentCluster.length > 1) {
        // Generate a pseudo-hash for ID
        const hash = `semantic-${Date.now()}-${i}`
        clusters.push({ hash, files: currentCluster, type: 'SEMANTIC' })
      }
    }

    logger.info(`Found ${clusters.length} semantic duplicate clusters`)
    return clusters
  }
}

export const deduplicationService = DeduplicationService.getInstance()
