import { FileNode, FileTag } from '../shared/types'
import { privacyService } from './privacy-service'

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
    const content = `${file.name} ${file.metadata?.text || ''}`
    const lowerContent = content.toLowerCase()

    const sensitiveMatches = privacyService.detect(content)
    if (sensitiveMatches.length > 0) {
      tags.add('SENSITIVE')
    }

    for (const rule of this.rules) {
      if (this.matchesRule(lowerContent, rule)) {
        tags.add(rule.tag)
      }
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
