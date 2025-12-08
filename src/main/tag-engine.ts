import { FileNode, FileTag } from '../shared/types'
import path from 'path'

interface TagRule {
  tag: FileTag
  patterns: RegExp[]
  minScore: number
}

export class TagEngine {
  private rules: TagRule[] = [
    {
      tag: 'INVOICE',
      patterns: [/invoice/i, /bill/i, /receipt/i, /payment/i],
      minScore: 1
    },
    {
      tag: 'CONTRACT',
      patterns: [/contract/i, /agreement/i, /nda/i, /terms/i, /sign/i],
      minScore: 1
    },
    {
      tag: 'FINANCIAL',
      patterns: [/tax/i, /statement/i, /bank/i, /finance/i, /salary/i, /payroll/i],
      minScore: 1
    },
    {
      tag: 'PERSONAL',
      patterns: [/passport/i, /resume/i, /cv/i, /id_card/i, /driver/i],
      minScore: 1
    },
    {
      tag: 'SCREENSHOT',
      patterns: [/screen/i, /capture/i, /shot/i, /^img_\d{8}/i, /^screenshot/i],
      minScore: 1
    }
  ]

  analyze(file: FileNode): FileTag[] {
    const tags: Set<FileTag> = new Set()
    const content = `${file.name} ${file.metadata?.text || ''}`.toLowerCase()

    for (const rule of this.rules) {
      if (this.matchesRule(content, rule)) {
        tags.add(rule.tag)
      }
    }

    // Implicit Tags based on extension
    const ext = path.extname(file.name).toLowerCase()
    if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        // Checking rules above might have already caught "screenshot"
        // But we could add 'IMAGE' if we had it
    }

    return Array.from(tags)
  }

  private matchesRule(content: string, rule: TagRule): boolean {
    for (const pattern of rule.patterns) {
      if (pattern.test(content)) {
        return true
      }
    }
    return false
  }
}

export const tagEngine = new TagEngine()
