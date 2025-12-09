import { parentPort } from 'worker_threads'
import { pipeline } from '@xenova/transformers'

export type AiWorkerCommand =
  | { type: 'INIT' }
  | { type: 'EMBED'; id: string; text: string }
  | { type: 'SUMMARIZE'; id: string; text: string }
  | { type: 'CLUSTER'; items: { id: string; vec: number[] }[]; threshold: number }

export type AiWorkerResponse =
  | { type: 'INIT_DONE' }
  | { type: 'EMBED_RES'; id: string; embedding: number[] }
  | { type: 'SUMMARIZE_RES'; id: string; summary: string }
  | { type: 'CLUSTER_RES'; clusters: string[][] }
  | { type: 'ERROR'; error: string; id?: string }

if (!parentPort) throw new Error('Must be run as a worker')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let summarizer: any = null

function dotProduct(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i]
  return sum
}

parentPort.on('message', async (cmd: AiWorkerCommand) => {
  try {
    switch (cmd.type) {
      case 'INIT':
        if (!embedder) {
          embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true
          })
        }
        parentPort?.postMessage({ type: 'INIT_DONE' })
        break

      case 'EMBED':
        if (!embedder) {
          embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            quantized: true
          })
        }
        const output = await embedder(cmd.text, { pooling: 'mean', normalize: true })
        const embedding = Array.from(output.data) as number[]
        parentPort?.postMessage({ type: 'EMBED_RES', id: cmd.id, embedding })
        break

      case 'SUMMARIZE':
        if (!summarizer) {
          summarizer = await pipeline('summarization', 'Xenova/distilbart-cnn-6-6', {
            quantized: true
          })
        }
        const result = await summarizer(cmd.text.substring(0, 4000), {
          max_new_tokens: 100,
          min_new_tokens: 20,
          do_sample: false
        })
        const summary = (result as { summary_text?: string }[])[0]?.summary_text || 'No summary.'
        parentPort?.postMessage({ type: 'SUMMARIZE_RES', id: cmd.id, summary })
        break

      case 'CLUSTER': {
        const { items, threshold } = cmd
        const clusters: string[][] = []
        // Simple greedy clustering assuming normalized vectors
        const clusterReps: number[][] = []

        for (const item of items) {
          let found = false
          for (let i = 0; i < clusterReps.length; i++) {
            const sim = dotProduct(item.vec, clusterReps[i])
            if (sim >= threshold) {
              clusters[i].push(item.id)
              found = true
              break
            }
          }
          if (!found) {
            clusters.push([item.id])
            clusterReps.push(item.vec)
          }
        }
        parentPort?.postMessage({ type: 'CLUSTER_RES', clusters })
        break
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    parentPort?.postMessage({ type: 'ERROR', error: errorMsg, id: (cmd as { id?: string }).id })
  }
})
