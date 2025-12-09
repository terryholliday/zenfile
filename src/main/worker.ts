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

// OCR Worker instance (lazy loaded)
let ocrWorker: TesseractWorker | null = null

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
        await handleScanDir(command.path)
        break
      case WorkerMessageType.CMD_HASH_FILE:
        await handleHashFile(command.filePath)
        break
      case WorkerMessageType.CMD_OCR_FILE:
        await handleOcrFile(command.filePath)
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
      path: (command as any).path || (command as any).filePath,
      fatal: false
    }
    parentPort?.postMessage(errorResponse)
  }
})

async function handleOcrFile(filePath: string) {
  try {
    const worker = await getOcrWorker()

    // Race between OCR and timeout
    const ocrPromise = worker.recognize(filePath)
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('OCR timed out')), 60000)
    )

    const result = (await Promise.race([ocrPromise, timeoutPromise])) as any
    const text = result.data.text

    const response: OcrResultResponse = {
      type: WorkerMessageType.RES_OCR_RESULT,
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

async function handleScanDir(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    const files: FileNode[] = []
    const dirs: string[] = []

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        dirs.push(fullPath)
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath)
          files.push({
            id: uuidv4(),
            path: fullPath,
            name: entry.name,
            sizeBytes: stats.size,
            atimeMs: stats.atimeMs,
            mtimeMs: stats.mtimeMs,
            isDirectory: false,
            tags: []
            // metadata is optional so no change needed here for now
          })
        } catch (statErr) {
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
    const errorMsg = (err as any).code || (err as any).message || String(err)
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

async function handleHashFile(filePath: string): Promise<void> {
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
        filePath,
        hash: result
      }
      parentPort?.postMessage(response)
      resolve()
    })
  })
}
