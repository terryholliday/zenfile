import { FileNode, SmartStack } from '../../../shared/types'

export class StackAnalyzer {
  analyze(files: FileNode[]): SmartStack[] {
    const stacks: SmartStack[] = []

    // 1. Extensions (File Type)
    const typeGroups = this.groupByExtension(files)
    for (const [ext, group] of Object.entries(typeGroups)) {
      if (group.length > 2) {
        stacks.push({
          id: crypto.randomUUID(),
          label: `${ext.toUpperCase()} Files`,
          type: 'FILE_TYPE',
          confidence: 0.8,
          files: group,
          reason: `Found ${group.length} ${ext} files`,
          action: 'MOVE'
        })
      }
    }

    // 2. Date-based (Year/Month)
    const dateGroups = this.groupByDate(files)
    for (const [dateLabel, group] of Object.entries(dateGroups)) {
      // Only suggest if significant number
      if (group.length > 3) {
        stacks.push({
          id: crypto.randomUUID(),
          label: dateLabel, // e.g. "2023 Photos" or "October 2024"
          type: 'DATE',
          confidence: 0.9,
          files: group,
          reason: `Created in ${dateLabel}`,
          action: 'MOVE'
        })
      }
    }

    // 3. Project/Keyword Clustering (Simple)
    const projectGroups = this.groupByKeyword(files)
    for (const [keyword, group] of Object.entries(projectGroups)) {
      // Only suggest if significant
      if (group.length > 2) {
        // De-duplicate: don't show if covered by Date/Type logic ideally,
        // but for now just push it. Use high confidence.
        stacks.push({
          id: crypto.randomUUID(),
          label: `Project: ${keyword}`,
          type: 'PROJECT',
          confidence: 0.7,
          files: group,
          reason: `Files contain keyword '${keyword}'`,
          action: 'MOVE'
        })
      }
    }

    return stacks
  }

  private groupByExtension(files: FileNode[]) {
    const groups: Record<string, FileNode[]> = {}
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() || 'unknown'
      if (!groups[ext]) groups[ext] = []
      groups[ext].push(f)
    }
    return groups
  }

  private groupByDate(files: FileNode[]) {
    const groups: Record<string, FileNode[]> = {} // "2023", "2024-01"
    for (const f of files) {
      if (!f.mtimeMs) continue
      const date = new Date(f.mtimeMs)
      const year = date.getFullYear()
      // Group by Year for now
      const key = `${year} Archives`

      if (!groups[key]) groups[key] = []
      groups[key].push(f)
    }
    return groups
  }

  private groupByKeyword(files: FileNode[]) {
    // Simple keyword extraction from filenames
    // Ignore common stop words
    const stops = ['the', 'and', 'for', 'doc', 'file', 'copy', 'new', 'old', 'img', 'scan']
    const groups: Record<string, FileNode[]> = {}

    for (const f of files) {
      // Tokenize
      const tokens = f.name
        .toLowerCase()
        .replace(/\.[^/.]+$/, '')
        .split(/[-_\s]+/)
      for (const token of tokens) {
        if (token.length > 3 && !stops.includes(token) && isNaN(Number(token))) {
          // Capitalize for label
          const label = token.charAt(0).toUpperCase() + token.slice(1)
          if (!groups[label]) groups[label] = []
          groups[label].push(f)
        }
      }
    }

    // Filter out weak groups
    const strongGroups: Record<string, FileNode[]> = {}
    for (const [key, val] of Object.entries(groups)) {
      if (val.length > 2) {
        strongGroups[key] = val
      }
    }

    return strongGroups
  }
}

export const stackAnalyzer = new StackAnalyzer()
