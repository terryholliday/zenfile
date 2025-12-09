import { FileNode } from './types'

export enum WorkerMessageType {
  CMD_SCAN_DIR = 'CMD_SCAN_DIR',
  CMD_HASH_FILE = 'CMD_HASH_FILE',
  CMD_TERMINATE = 'CMD_TERMINATE',
  CMD_OCR_FILE = 'CMD_OCR_FILE',

  RES_SCAN_RESULT = 'RES_SCAN_RESULT',
  RES_HASH_RESULT = 'RES_HASH_RESULT',
  RES_OCR_RESULT = 'RES_OCR_RESULT',
  RES_ERROR = 'RES_ERROR',
  RES_READY = 'RES_READY'
}

export interface ScanDirCommand {
  type: WorkerMessageType.CMD_SCAN_DIR
  path: string
  // Pass exclusions to worker to prevent IPC flood
  exclusions: string[]
}

export interface HashFileCommand {
  type: WorkerMessageType.CMD_HASH_FILE
  id: string
  filePath: string
}

export interface TerminateCommand {
  type: WorkerMessageType.CMD_TERMINATE
}

export interface OcrFileCommand {
  type: WorkerMessageType.CMD_OCR_FILE
  id: string
  filePath: string
}

export type WorkerCommand = ScanDirCommand | HashFileCommand | TerminateCommand | OcrFileCommand

export interface ScanResultResponse {
  type: WorkerMessageType.RES_SCAN_RESULT
  files: FileNode[]
  dirs: string[]
}

export interface HashResultResponse {
  type: WorkerMessageType.RES_HASH_RESULT
  id: string
  filePath: string
  hash: string
}

export interface OcrResultResponse {
  type: WorkerMessageType.RES_OCR_RESULT
  id: string
  filePath: string
  text: string
}

export interface ErrorResponse {
  type: WorkerMessageType.RES_ERROR
  error: string
  path?: string
  fatal: boolean
}

export interface ReadyResponse {
  type: WorkerMessageType.RES_READY
}

export type WorkerResponse =
  | ScanResultResponse
  | HashResultResponse
  | ErrorResponse
  | ReadyResponse
  | OcrResultResponse
