import { FileNode, SmartStack } from '../../../shared/types'
import { v4 as uuidv4 } from 'uuid'

// --- Helpers ---

// Stop words to ignore in keyword analysis
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'copy', 'final', 'draft', 
  'new', 'old', 'backup', 'document', 'file', 'image', 'photo',
  'desktop', 'download', 'screenshot', 'screen', 'shot'
])

function tokenize(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[._-]/g, ' ') // Replace separators with spaces
    .replace(/[^a-z0-9 ]/g, '') // Remove special chars
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOP_WORDS.has(w))
}

// --- Analyzers ---

function analyzeScreenshots(files: FileNode[]): SmartStack | null {
  const screenshots = files.filter(f => {
    const name = f.name.toLowerCase()
    return (
      name.includes('screenshot') || 
      name.includes('screen shot') ||
      name.startsWith('img_') || // Generic camera imports often drift here
      name.startsWith('capture')
    )
  })

  // Heuristic: If we have a bunch of screenshots, group them
  if (screenshots.length >= 3) {
    return {
      id: uuidv4(),
      label: 'Screenshots & Captures',
      type: 'FILE_TYPE',
      confidence: 0.9,
      files: screenshots,
      reason: `Found ${screenshots.length} screen captures`,
      action: 'MOVE'
    }
  }
  return null
}

function analyzeInstallers(files: FileNode[]): SmartStack | null {
  const installers = files.filter(f => {
    const ext = f.name.split('.').pop()?.toLowerCase()
    return ['exe', 'msi', 'dmg', 'pkg', 'iso'].includes(ext || '')
  })

  if (installers.length >= 2) {
    return {
      id: uuidv4(),
      label: 'Installers & Disk Images',
      type: 'FILE_TYPE',
      confidence: 0.95,
      files: installers,
      reason: `Found ${installers.length} installer files`,
      action: 'DELETE' // Bold suggestion, maybe MOVE is safer
    }
  }
  return null
}

function analyzeProjects(files: FileNode[]): SmartStack[] {
  // 1. Frequency Map
  const tokenMap = new Map<string, FileNode[]>()
  
  files.forEach(file => {
    // Only analyze loose documents, not system files or existing stacks
    if (['exe', 'dmg', 'app'].includes(file.name.split('.').pop()?.toLowerCase() || '')) return

    const tokens = tokenize(file.name)
    // Generate bigrams for better context (e.g. "project alpha", "tax return")
    for (let i = 0; i < tokens.length; i++) {
        // Unigrams
        const t = tokens[i]
        if (!tokenMap.has(t)) tokenMap.set(t, [])
        tokenMap.get(t)?.push(file)

        // Bigrams
        if (i < tokens.length - 1) {
            const bigram = `${t} ${tokens[i+1]}`
            if (!tokenMap.has(bigram)) tokenMap.set(bigram, [])
            tokenMap.get(bigram)?.push(file)
        }
    }
  })

  const stacks: SmartStack[] = []
  
  // 2. Filter significant clusters
  tokenMap.forEach((matchedFiles, token) => {
    // Dedup files in the cluster
    const uniqueFiles = Array.from(new Set(matchedFiles))

    // Threshold: At least 3 files sharing a keyword/topic
    if (uniqueFiles.length >= 3) {
        
        // Check if this is a "better" version of an existing stack
        // (Complexity: Simplistic "longest string wins" or "most files wins" logic here)
        // For MVP, we just add everything and let the UI/User sort it out, 
        // OR we filter out unigrams if they are part of a bigram stack.
        
        stacks.push({
            id: uuidv4(),
            label: `"${token}" Related`,
            type: 'PROJECT',
            confidence: 0.7,
            files: uniqueFiles,
            reason: `${uniqueFiles.length} files matched keyword "${token}"`,
            action: 'MOVE'
        })
    }
  })

  // 3. Cleanup: Remove subsets. 
  // If Stack A (files) is a subset of Stack B (files), drop A.
  // Actually, let's keep it simple: Sort by file count desc, take top 5 non-overlapping?
  // Overlap is hard. Let's return raw candidates for now.
  
  return stacks.sort((a, b) => b.files.length - a.files.length).slice(0, 5) // Return top 5 suggestions
}

// --- Main Export ---

export function analyzeStacks(allFiles: FileNode[]): SmartStack[] {
    const stacks: SmartStack[] = []

    // 1. File Type Clusters
    const screenStack = analyzeScreenshots(allFiles)
    if (screenStack) stacks.push(screenStack)

    const installStack = analyzeInstallers(allFiles)
    if (installStack) stacks.push(installStack)

    // 2. Keyword/Project Clusters
    // Filter out files already stacked to avoid noise (optional, but clean)
    const stackedIds = new Set(stacks.flatMap(s => s.files.map(f => f.id)))
    const remainingFiles = allFiles.filter(f => !stackedIds.has(f.id))
    
    const projectStacks = analyzeProjects(remainingFiles)
    stacks.push(...projectStacks)

    return stacks
}
