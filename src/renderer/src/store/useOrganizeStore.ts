import { create } from 'zustand'
import { SmartStack, FileNode } from '../../../shared/types'
import { stackAnalyzer } from '../utils/stackAnalyzer'
import { useScanStore } from './useScanStore'

interface OrganizeStoreState {
  stacks: SmartStack[]
  isAnalyzing: boolean
  
  history: { stackId: string, files: { id: string, from: string, to: string }[] }[]
  undo: () => Promise<void>
  
  analyze: (files: FileNode[]) => void
  dismissStack: (stackId: string) => void
  executeStack: (stackId: string, destination?: string, options?: { generateDna?: boolean }) => Promise<void>
}

export const useOrganizeStore = create<OrganizeStoreState>((set, get) => ({
  stacks: [],
  history: [],
  isAnalyzing: false,

  analyze: (files: FileNode[]) => {
    set({ isAnalyzing: true })
    
    // Simulate async work for UI feel
    setTimeout(() => {
        const stacks = stackAnalyzer.analyze(files)
        set({ stacks, isAnalyzing: false })
    }, 500)
  },

  dismissStack: (stackId: string) => {
    set(state => ({
        stacks: state.stacks.filter(s => s.id !== stackId)
    }))
  },

  undo: async () => {
    const { history } = get()
    if (history.length === 0) return

    const lastAction = history[history.length - 1]
    const { sessionId, settings } = useScanStore.getState()
    
    // Group by original path parent to batch moves if possible
    const groups: Record<string, string[]> = {} // dest -> fileIds[]
    
    for (const record of lastAction.files) {
        // extract parent directory
        const originalDir = record.from.substring(0, record.from.lastIndexOf('\\'))
        if (!groups[originalDir]) groups[originalDir] = []
        groups[originalDir].push(record.id)
    }

    try {
        for (const [originalDir, fileIds] of Object.entries(groups)) {
             await window.fileZen.moveFiles({
                sessionId,
                fileIds,
                destination: originalDir,
                dryRun: settings?.dryRun ?? false
            })
        }
        
        // Remove from history
        set(state => ({ history: state.history.slice(0, -1) }))
        
    } catch (err) {
        console.error("Undo failed", err)
    }
  },

  executeStack: async (stackId: string, customDestination?: string, options?: { generateDna?: boolean }) => {
    const { stacks } = get()
    const stack = stacks.find(s => s.id === stackId)
    if (!stack) return

    const { sessionId, settings } = useScanStore.getState()
    if (!sessionId) {
        console.error("No active session")
        return
    }

    // Determine final destination
    let finalDest = customDestination
    if (!finalDest) {
         // Default: Create folder alongside the first file
         const firstFile = stack.files[0]
         const parent = firstFile.path.substring(0, firstFile.path.lastIndexOf('\\'))
         finalDest = `${parent}\\${stack.label}`
    }

    try {
        // prepare history record
        const historyRecord = {
            stackId,
            files: stack.files.map(f => ({
                id: f.id,
                from: f.path, // Current path
                to: `${finalDest}\\${f.name}` // Predicted new path
            }))
        }

        await window.fileZen.moveFiles({
            sessionId,
            fileIds: stack.files.map(f => f.id),
            destination: finalDest,
            dryRun: settings?.dryRun ?? false
        })

        // Generate DNA if requested
        if (options?.generateDna && !settings?.dryRun) {
            window.fileZen.generateProjectDna(finalDest)
                .then(() => console.log(`DNA Generated for ${finalDest}`))
                .catch(err => console.error(`Failed to generate DNA`, err))
        }

        // On success, update history and remove stack
        set(state => ({ 
            history: [...state.history, historyRecord],
            stacks: state.stacks.filter(s => s.id !== stackId) 
        }))
        
    } catch (err) {
        console.error("Failed to execute stack", err)
    }
  }
}))
