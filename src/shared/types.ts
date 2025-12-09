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
  RedactText = 'IPC_REDACT_TEXT',
  GenerateProjectDna = 'IPC_GENERATE_PROJECT_DNA'
}

export type ScannerState = 'IDLE' | 'SCANNING' | 'PAUSED' | 'CANCELLING' | 'COMPLETED' | 'CANCELLED'

export type FileTag =
  | 'DUPLICATE'
  | 'LARGE'
  | 'STALE'
  | 'JUNK'
  | 'EMPTY_FOLDER'
  | 'INVOICE'
  | 'CONTRACT'
  | 'RECEIPT'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'PERSONAL'
  | 'SCREENSHOT'
  | 'SENSITIVE'

export interface FileNode {
  id: string
  path: string
  name: string
  sizeBytes: number
  atimeMs: number | null
  mtimeMs: number | null
  isDirectory: boolean
  hash?: string
  tags: FileTag[]
  metadata?: {
    text?: string
    lastIndex?: number
  }
}

export interface DuplicateCluster {
  hash: string
  files: FileNode[]
  type?: 'EXACT' | 'SEMANTIC'
}

export interface Anchor {
  id: string
  path: string
  name: string
  score: number
  keywords: string[]
}

export interface Suggestion {
  id: string
  type: 'CONSOLIDATE' | 'ORGANIZE'
  anchor: Anchor
  files: FileNode[]
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
  files: FileNode[]
}

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
  progress: number
  liveLargeFiles?: FileNode[]
  liveFlaggedFiles?: FileNode[]
  liveInsight?: string
}

export interface ActionPayload {
  sessionId: string
  fileIds: string[]
  dryRun: boolean
}

export interface ActionResult {
  success: string[]
  failures: string[]
}

export interface FileZenApi {
  startScan(payload: ScanStartPayload): void
  cancelScan(payload: { sessionId: string }): void
  onScanProgress(handler: (payload: ScanProgressPayload) => void): () => void
  moveToQuarantine(payload: ActionPayload): Promise<ActionResult>
  sendToTrash(payload: ActionPayload): Promise<ActionResult>
  getSettings(): Promise<SettingsSchema>
  saveSettings(settings: SettingsSchema): Promise<void>
  openDirectory(): Promise<string | null>
  getResults(sessionId: string): Promise<ScanSession | null>
  getSuggestions(sessionId: string): Promise<Suggestion[]>
  moveFiles(payload: ActionPayload & { destination: string }): Promise<ActionResult>
  aiSearch(query: string): Promise<unknown[]>
  redactText(text: string): Promise<string>
  generateProjectDna(folderPath: string): Promise<string>
}

export type StackType = 'FILE_TYPE' | 'DATE' | 'PROJECT' | 'AI_CLUSTER'

export interface SmartStack {
  id: string
  label: string
  type: StackType
  confidence: number
  files: FileNode[]
  reason: string
  action: 'MOVE' | 'ARCHIVE' | 'DELETE'
}
