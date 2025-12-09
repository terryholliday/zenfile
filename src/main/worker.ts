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
import { FileNode, FileTag } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'

// -----------------
// Constants & Tag Rules
// -----------------

const TAG_RULES = [
  { tag: 'IMAGE', patterns: [/\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i] },
  { tag: 'VIDEO', patterns: [/\.(mp4|mkv|mov|avi|wmv|flv|webm)$/i] },
  { tag: 'AUDIO', patterns: [/\.(mp3|wav|flac|aac|ogg|m4a)$/i] },
  { tag: 'DOCUMENT', patterns: [/\.(pdf|doc|docx|txt|rtf|odt|md)$/i] },
  { tag: 'ARCHIVE', patterns: [/\.(zip|rar|7z|tar|gz|iso)$/i] },
  {
    tag: 'CODE',
    patterns: [/\.(js|ts|tsx|jsx|css|html|json|py|java|c|cpp|h|cs|go|rs|php|rb|sql)$/i]
  },
  { tag: 'EXECUTABLE', patterns: [/\.(exe|msi|bat|sh|app|dmg|pkg)$/i] },
  { tag: 'SCREENSHOT', patterns: [/screen/i, /capture/i, /shot/i, /^img_\d{8}/i, /^screenshot/i] }
]

const DEFAULT_IGNORES = new Set([
  'node_modules',
  '.git',
  '.DS_Store',
  'Thumbs.db',
  'dist',
  'build',
  'out',
  'coverage',
  '.idea',
  '.vscode',
  'src',
  'app',
  'components',
  'pages',
  'public'
])

// -----------------
// Helpers
// -----------------

function analyzeTags(fileName: string, text?: string): FileTag[] {
  const tags = new Set<string>()
  const safeText = (text || '').substring(0, 5000)
  const content = `${fileName} ${safeText}`.toLowerCase()

  for (const rule of TAG_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(content)) {
        tags.add(rule.tag as FileTag)
        break
      }
    }
  }
  return Array.from(tags) as FileTag[]
}

function shouldIgnore(name: string, exclusions: string[]): boolean {
  if (DEFAULT_IGNORES.has(name)) return true
  if (name.startsWith('.')) return true
  if (exclusions.includes(name)) return true
  return false
}

// -----------------
// Worker State
// -----------------

if (!parentPort) {
  throw new Error('Worker must be spawned with parentPort')
}

let ocrWorker: TesseractWorker | null = null

async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorker) {
    ocrWorker = await createWorker('eng')
  }
  return ocrWorker
}

// -----------------
// Message Handling
// -----------------

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

// -----------------
// Handlers
// -----------------

async function handleScanDir(dirPath: string, exclusions: string[] = []): Promise<void> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    const files: FileNode[] = []
    const dirs: string[] = []

    for (const entry of entries) {
      if (shouldIgnore(entry.name, exclusions)) continue

      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        dirs.push(fullPath)
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath)
          const tags = analyzeTags(entry.name)

          const node: FileNode = {
            id: uuidv4(),
            path: fullPath,
            name: entry.name,
            sizeBytes: stats.size,
            atimeMs: stats.atimeMs,
            mtimeMs: stats.mtimeMs,
            isDirectory: false,
            tags: tags
          }
          files.push(node)
        } catch {
          // Ignore files we can't stat
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

async function handleOcrFile(id: string, filePath: string): Promise<void> {
  try {
    const worker = await getOcrWorker()

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
      text: text.trim().substring(0, 1000)
    }
    parentPort?.postMessage(response)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const response: WorkerResponse = {
      type: WorkerMessageType.RES_ERROR,
      error: `OCR Failed: ${errorMsg}`,
      path: filePath,
      fatal: false
    }
    parentPort?.postMessage(response)
  }
}

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
