import { create } from 'zustand'
import { SmartStack, FileNode } from '../../../shared/types'
import { analyzeStacks } from '../utils/stackAnalyzer'
import { useScanStore } from './useScanStore'

interface OrganizeStoreState {
  stacks: SmartStack[]
  isAnalyzing: boolean
  
  analyze: (files: FileNode[]) => void
  dismissStack: (stackId: string) => void
  executeStack: (stackId: string, destination?: string) => Promise<void>
}

export const useOrganizeStore = create<OrganizeStoreState>((set, get) => ({
  stacks: [],
  isAnalyzing: false,

  analyze: (files: FileNode[]) => {
    set({ isAnalyzing: true })
    
    // Simulate async work for UI feel (and to unblock render if we move to worker later)
    setTimeout(() => {
        const stacks = analyzeStacks(files)
        set({ stacks, isAnalyzing: false })
    }, 500)
  },

  dismissStack: (stackId: string) => {
    set(state => ({
        stacks: state.stacks.filter(s => s.id !== stackId)
    }))
  },

  executeStack: async (stackId: string, customDestination?: string) => {
    const { stacks } = get()
    const stack = stacks.find(s => s.id === stackId)
    if (!stack) return

    const { sessionId, settings } = useScanStore.getState()
    if (!sessionId) {
        console.error("No active session")
        return
    }

    // Default destination logic
    // For now, let's assume we create a folder in the 'first' include path or user desktop?
    // Better: let the UI pass it in. If generic "Organize", we might default to:
    // [ParentFolder]/[StackLabel]
    
    // Use the directory of the first file as the base
    const baseDir = customDestination || window.fileZen ? 
        (stack.files[0]?.path.split(/[\\/]/).slice(0, -1).join(window.fileZen.sep || '\\') + '\\' + stack.label) 
        : '';
        
    // Wait, I don't have 'sep' exposed. I'll rely on the main process OR simple string manipulation.
    // Since windows is the target, '\\' is safe.
    
    // Implementation:
    // 1. Determine optimized destination (e.g. creating a folder named "Screenshots")
    // 2. Call API
    
    // Fallback if no destination provided
    let finalDest = customDestination
    if (!finalDest) {
         // Create folder alongside the first file
         const firstFile = stack.files[0]
         // Simple dirname
         const parent = firstFile.path.substring(0, firstFile.path.lastIndexOf('\\'))
         finalDest = `${parent}\\${stack.label}`
    }

    try {
        await window.fileZen.moveFiles({
            sessionId,
            fileIds: stack.files.map(f => f.id),
            destination: finalDest,
            dryRun: settings?.dryRun ?? false
        })

        // On success, remove stack
        get().dismissStack(stackId)
        
        // Also need to remove files from the source list in ScanStore?
        // Ideally scanStore listens to events, but for now we might need to manually trigger refresh?
        // Actually, scanStore handles "trash" via actionTrash. We might need similar logic here.
        // But for MVP, let's just update the Stacks UI.
    } catch (err) {
        console.error("Failed to execute stack", err)
    }
  }
}))
