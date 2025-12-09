import { parentPort } from 'worker_threads'
import fs from 'fs/promises'
import { createReadStream } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { createWorker, Worker as TesseractWorker } from 'tesseract.js'
import {
  WorkerMessageType,
  type WorkerCommand,
  type WorkerResponse,
  type ScanResultResponse,
  type HashResultResponse,
  type OcrResultResponse
} from '../shared/worker-types'
import { FileNode } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'

if (!parentPort) {
  throw new Error('Worker must be spawned with parentPort')
}

// Global error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  const errorMsg = err instanceof Error ? err.message : String(err)
  parentPort?.postMessage({
    type: WorkerMessageType.RES_ERROR,
    error: `Uncaught Exception: ${errorMsg}`,
    fatal: true
  } as WorkerResponse)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  parentPort?.postMessage({
    type: WorkerMessageType.RES_ERROR,
    error: `Unhandled Rejection: ${reason}`,
    fatal: true
  } as WorkerResponse)
  process.exit(1)
})

// OCR Worker instance (lazy loaded)
let ocrWorker: TesseractWorker | null = null

// Hardcoded defaults for safety, merged with incoming exclusions
const DEFAULT_IGNORES = new Set(['node_modules', '.git', '.DS_Store', 'Thumbs.db'])

function shouldIgnore(name: string, exclusions: string[]): boolean {
  if (DEFAULT_IGNORES.has(name)) return true
  // Simple check: Exact match or hidden file (starts with dot)
  if (exclusions.includes(name)) return true
  return false
}

async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorker) {
    ocrWorker = await createWorker('eng')
  }
  return ocrWorker
}

parentPort.postMessage({ type: WorkerMessageType.RES_READY })

parentPort.on('message', async (command: WorkerCommand) => {
  try {
    switch (command.type) {
      case WorkerMessageType.CMD_SCAN_DIR:
        await handleScanDir(command.path, command.exclusions)
        break
      case WorkerMessageType.CMD_HASH_FILE:
        await handleHashFile(command.id, command.filePath)
        break
      case WorkerMessageType.CMD_OCR_FILE:
        await handleOcrFile(command.id, command.filePath)
        break
      case WorkerMessageType.CMD_TERMINATE:
        if (ocrWorker) {
          await ocrWorker.terminate()
        }
        process.exit(0)
        break
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const errorResponse: WorkerResponse = {
      type: WorkerMessageType.RES_ERROR,
      error: errorMsg || 'Unknown worker error',
      path: 'path' in command ? command.path : 'filePath' in command ? command.filePath : undefined,
      fatal: false
    }
    parentPort?.postMessage(errorResponse)
  }
})

async function handleOcrFile(id: string, filePath: string): Promise<void> {
  try {
    const worker = await getOcrWorker()

    // Race between OCR and timeout
    const ocrPromise = worker.recognize(filePath)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timed out')), 60000)
    )

    const result = (await Promise.race([ocrPromise, timeoutPromise])) as { data: { text: string } }
    const text = result.data.text

    const response: OcrResultResponse = {
      type: WorkerMessageType.RES_OCR_RESULT,
      id,
      filePath,
      text: text.trim().substring(0, 1000) // Limit to 1KB for now
    }
    parentPort?.postMessage(response)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    // OCR might fail on some images, just log error
    const response: WorkerResponse = {
      type: WorkerMessageType.RES_ERROR,
      error: `OCR Failed: ${errorMsg}`,
      path: filePath,
      fatal: false
    }
    parentPort?.postMessage(response)
  }
}

async function handleScanDir(dirPath: string, exclusions: string[] = []): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    const files: FileNode[] = []
    const dirs: string[] = []

    for (const entry of entries) {
      // Filter IMMEDIATELY before stat() - reduces IPC by ~90% for code projects
      if (shouldIgnore(entry.name, exclusions)) continue

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        dirs.push(fullPath)
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath)
          
          const node: FileNode = {
            id: uuidv4(),
            path: fullPath,
            name: entry.name,
            sizeBytes: stats.size,
            atimeMs: stats.atimeMs,
            mtimeMs: stats.mtimeMs,
            isDirectory: false,
            tags: []
          }

          // PERF FIX: Run tagging in Worker, not Main
          node.tags = tagEngine.analyze(node)

          files.push(node)
        } catch {
          // Ignore files we can't stat (race conditions etc)
        }
      }
    }

    const response: ScanResultResponse = {
      type: WorkerMessageType.RES_SCAN_RESULT,
      files,
      dirs
    }
    parentPort?.postMessage(response)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    // EACCES or other IO errors on the directory itself
    const response: WorkerResponse = {
      type: WorkerMessageType.RES_ERROR,
      error: errorMsg,
      path: dirPath,
      fatal: false
    }
    parentPort?.postMessage(response)
  }
}

async function handleHashFile(id: string, filePath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const stream = createReadStream(filePath)

    // Safety timeout
    const timeout = setTimeout(() => {
      stream.destroy()
      reject(new Error('Hashing timed out after 30s'))
    }, 30000)

    stream.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    stream.on('data', (chunk) => {
      hash.update(chunk)
    })

    stream.on('end', () => {
      clearTimeout(timeout)
      const result = hash.digest('hex')
      const response: HashResultResponse = {
        type: WorkerMessageType.RES_HASH_RESULT,
        id,
        filePath,
        hash: result
      }
      parentPort?.postMessage(response)
      resolve()
    })
  })
}
