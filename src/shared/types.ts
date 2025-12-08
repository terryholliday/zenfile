export enum IpcChannel {
  ScanStart = 'IPC_SCAN_START',
  ScanCancel = 'IPC_SCAN_CANCEL',
  ScanProgress = 'IPC_SCAN_PROGRESS',
  ActionQuarantine = 'IPC_ACTION_QUARANTINE',
  ActionTrash = 'IPC_ACTION_TRASH',
  SettingsGet = 'IPC_SETTINGS_GET',
  SettingsSave = 'IPC_SETTINGS_SAVE',
  DialogOpen = 'IPC_DIALOG_OPEN',
  GetResults = 'IPC_GET_RESULTS',
  GetSuggestions = 'IPC_GET_SUGGESTIONS',
  ActionMove = 'IPC_ACTION_MOVE',
  AiSearch = 'IPC_AI_SEARCH',
  RedactText = 'IPC_REDACT_TEXT'
}

export type ScannerState = 'IDLE' | 'SCANNING' | 'PAUSED' | 'CANCELLING' | 'COMPLETED' | 'CANCELLED'
export type FileTag = 'DUPLICATE' | 'LARGE' | 'STALE' | 'JUNK' | 'EMPTY_FOLDER' | 'INVOICE' | 'CONTRACT' | 'RECEIPT' | 'FINANCIAL' | 'LEGAL' | 'PERSONAL' | 'SCREENSHOT' | 'SENSITIVE'

export interface FileNode {
  id: string // UUID
  path: string // Absolute path
  name: string
  sizeBytes: number
  atimeMs: number | null
  mtimeMs: number | null
  isDirectory: boolean
  hash?: string // SHA-256
  tags: FileTag[]
  metadata?: {
    text?: string // OCR content
    lastIndex?: number // Timestamp of last index
  }
}

export interface DuplicateCluster {
  hash: string
  files: FileNode[]
}

export interface Anchor {
  id: string // Folder ID or Path hash
  path: string // Folder Path
  name: string // "AI Projects"
  score: number // Confidence score
  keywords: string[] // "transformer", "model", etc.
}

export interface Match {
  fileId: string
  confidence: number
  reason: string // "Filename matches anchor keywords"
}

export interface Suggestion {
  id: string
  type: 'CONSOLIDATE' | 'ORGANIZE'
  anchor: Anchor
  files: FileNode[] // Orphans
  confidence: number
}

export interface SettingsSchema {
  schemaVersion: number
  maxFileMb: number
  staleYears: number
  includePaths: string[]
  excludePaths: string[]
  dryRun: boolean
  isDarkTheme: boolean
  enableOcr: boolean
}

export interface ScanSession {
  id: string
  startedAt: string
  state: ScannerState
  duplicates: DuplicateCluster[]
  largeFiles: FileNode[]
  staleFiles: FileNode[]
  junkFiles: FileNode[]
  emptyFolders: FileNode[]
  files: FileNode[] // All scanned files (for AI analysis)
}

// IPC Payloads
export interface ScanStartPayload {
  sessionId: string
  paths: string[]
  settings: SettingsSchema
}

export interface ScanProgressPayload {
  sessionId: string
  state: ScannerState
  filesScanned: number
  bytesScanned: number
  currentFile?: string
}

export interface ActionPayload {
  sessionId: string
  fileIds: string[]
  dryRun: boolean
}

// Preload API Contract
export interface FileZenApi {
  startScan(payload: ScanStartPayload): void
  cancelScan(payload: { sessionId: string }): void
  onScanProgress(handler: (payload: ScanProgressPayload) => void): () => void
  moveToQuarantine(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }>
  sendToTrash(payload: ActionPayload): Promise<{ success: string[]; failures: string[] }>
  getSettings(): Promise<SettingsSchema>
  saveSettings(settings: SettingsSchema): Promise<void>
  openDirectory(): Promise<string | null>
  getResults(sessionId: string): Promise<ScanSession | null>
  getSuggestions(sessionId: string): Promise<Suggestion[]>
  moveFiles(
    payload: ActionPayload & { destination: string }
  ): Promise<{ success: string[]; failures: string[] }>
  aiSearch(query: string): Promise<any[]>
  redactText(text: string): Promise<string>
}

// --- AI / Smart Stack Types ---

export type StackType = 'DATE' | 'PROJECT' | 'FILE_TYPE' | 'CUSTOM'

export interface SmartStack {
  id: string
  label: string // e.g. "2024 Tax Docs"
  type: StackType
  confidence: number // 0-1
  files: FileNode[]
  reason: string // "Matches 'Tax' keyword and year 2024"
  action: 'MOVE' | 'ZIP' | 'DELETE' | 'NONE'
}
