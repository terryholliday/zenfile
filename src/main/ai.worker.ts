import { parentPort } from 'worker_threads'
import { pipeline } from '@xenova/transformers'

// Define explicit message types for the AI worker
export type AiWorkerCommand =
  | { type: 'INIT' }
  | { type: 'EMBED'; id: string; text: string }
  | { type: 'SUMMARIZE'; text: string }

export type AiWorkerResponse =
  | { type: 'INIT_DONE' }
  | { type: 'EMBED_RES'; id: string; embedding: number[] }
  | { type: 'SUMMARIZE_RES'; summary: string }
  | { type: 'ERROR'; error: string; id?: string }

if (!parentPort) throw new Error('Must be run as a worker')

// Use `any` for pipeline instances since types are complex
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let summarizer: any = null

parentPort.on('message', async (cmd: AiWorkerCommand) => {
  try {
    switch (cmd.type) {
      case 'INIT':
        // Load embedder model (summarizer loaded lazily)
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
        parentPort?.postMessage({ type: 'SUMMARIZE_RES', summary })
        break
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    parentPort?.postMessage({ type: 'ERROR', error: errorMsg, id: (cmd as { id?: string }).id })
  }
})
