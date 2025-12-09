import { create } from 'zustand'
import {
  ScanStartPayload,
  ScannerState,
  SettingsSchema,
  FileNode,
  ScanProgressPayload,
  DuplicateCluster
} from '../../../shared/types'
import { v4 as uuidv4 } from 'uuid'

interface ScanStoreState {
  scanState: ScannerState
  sessionId: string | null
  filesScanned: number
  bytesScanned: number
  currentFile?: string

  duplicates: DuplicateCluster[]
  largeFiles: FileNode[]
  files: FileNode[]

  liveLargeFiles: FileNode[]
  liveFlaggedFiles: FileNode[]
  liveInsight: string

  settings: SettingsSchema | null

  // FIX: Explicit Promise return types
  initialize: () => Promise<void>
  startScan: (paths: string[]) => Promise<void>
  cancelScan: () => void
  updateProgress: (payload: ScanProgressPayload) => void
  setIncludePath: (path: string) => void
  updateSettings: (settings: Partial<SettingsSchema>) => Promise<void>

  loadResults: () => Promise<void>
  actionTrash: (fileIds: string[]) => Promise<void>
  actionQuarantine: (fileIds: string[]) => Promise<void>
}

export const useScanStore = create<ScanStoreState>((set, get) => ({
  scanState: 'IDLE',
  sessionId: null,
  filesScanned: 0,
  bytesScanned: 0,
  currentFile: '',
  settings: null,

  duplicates: [],
  largeFiles: [],
  files: [],

  liveLargeFiles: [],
  liveFlaggedFiles: [],
  liveInsight: '',

  initialize: async () => {
    try {
      const settings = await window.fileZen.getSettings()
      set({ settings })
    } catch (err) {
      console.error('Failed to load settings', err)
    }
    window.fileZen.onScanProgress((payload) => {
      get().updateProgress(payload)
    })
  },

  startScan: async (paths: string[]) => {
    let { settings } = get()
    if (!settings) {
      settings = {
        schemaVersion: 1,
        maxFileMb: 50,
        staleYears: 1,
        includePaths: paths,
        excludePaths: [],
        dryRun: true,
        isDarkTheme: true,
        enableOcr: false
      }
      set({ settings })
    }

    const sessionId = uuidv4()
    set({
      sessionId,
      scanState: 'SCANNING',
      filesScanned: 0,
      bytesScanned: 0,
      duplicates: [],
      largeFiles: []
    })

    const payload: ScanStartPayload = {
      sessionId,
      paths,
      settings
    }

    // startScan is void on IPC side, so we don't await a response,
    // but the function is async to match the interface if needed, or just standard JS.
    window.fileZen.startScan(payload)
  },

  cancelScan: () => {
    const { sessionId } = get()
    if (sessionId) {
      window.fileZen.cancelScan({ sessionId })
      set({ scanState: 'CANCELLING' })
    }
  },

  updateProgress: (payload: ScanProgressPayload) => {
    const { sessionId, scanState, loadResults } = get()

    if (
      payload.sessionId === sessionId &&
      payload.state === 'COMPLETED' &&
      scanState !== 'COMPLETED'
    ) {
      // Small delay to ensure DB is written before reading
      setTimeout(() => void loadResults(), 500)
    }

    set({
      scanState: payload.state,
      filesScanned: payload.filesScanned,
      bytesScanned: payload.bytesScanned,
      currentFile: payload.currentFile,
      liveLargeFiles: payload.liveLargeFiles || [],
      liveFlaggedFiles: payload.liveFlaggedFiles || [],
      liveInsight: payload.liveInsight || ''
    })
  },

  setIncludePath: (path: string) => {
    const { settings } = get()
    const current = settings || {
      schemaVersion: 1,
      maxFileMb: 50,
      staleYears: 1,
      includePaths: [],
      excludePaths: [],
      dryRun: true,
      isDarkTheme: true,
      enableOcr: false
    }
    const newSettings = { ...current, includePaths: [path] }
    set({ settings: newSettings })
    void window.fileZen.saveSettings(newSettings)
  },

  updateSettings: async (update) => {
    const current = get().settings
    if (!current) return
    const newSettings = { ...current, ...update }
    set({ settings: newSettings })
    await window.fileZen.saveSettings(newSettings)
  },

  loadResults: async () => {
    const { sessionId } = get()
    if (!sessionId) return

    try {
      const session = await window.fileZen.getResults(sessionId)
      if (session) {
        set({
          duplicates: session.duplicates,
          largeFiles: session.largeFiles,
          files: session.files,
          scanState: session.state
        })
      }
    } catch (e) {
      console.error('Failed to load results', e)
    }
  },

  actionTrash: async (fileIds) => {
    const { sessionId, settings } = get()
    if (!sessionId) return

    await window.fileZen.sendToTrash({
      sessionId,
      fileIds,
      dryRun: settings?.dryRun ?? false
    })

    const { duplicates, largeFiles } = get()
    const newLarge = largeFiles.filter((f) => !fileIds.includes(f.id))
    const newDups = duplicates
      .map((c) => ({
        ...c,
        files: c.files.filter((f) => !fileIds.includes(f.id))
      }))
      .filter((c) => c.files.length > 1)

    set({ duplicates: newDups, largeFiles: newLarge })
  },

  actionQuarantine: async (fileIds) => {
    const { sessionId, settings } = get()
    if (!sessionId) return

    await window.fileZen.moveToQuarantine({
      sessionId,
      fileIds,
      dryRun: settings?.dryRun ?? false
    })

    const { duplicates, largeFiles } = get()
    const newLarge = largeFiles.filter((f) => !fileIds.includes(f.id))
    const newDups = duplicates
      .map((c) => ({
        ...c,
        files: c.files.filter((f) => !fileIds.includes(f.id))
      }))
      .filter((c) => c.files.length > 1)

    set({ duplicates: newDups, largeFiles: newLarge })
  }
}))
