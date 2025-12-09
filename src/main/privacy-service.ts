export class PrivacyService {
  private static instance: PrivacyService

  // PII Regex Patterns
  private patterns = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\b/g,
    ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
    creditCard: /\b(?:\d{4}[- ]){3}\d{4}|\b\d{15,16}\b/g,
    ipv4: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g
  }

  private constructor() {}

  static getInstance(): PrivacyService {
    if (!PrivacyService.instance) {
      PrivacyService.instance = new PrivacyService()
    }
    return PrivacyService.instance
  }

  /**
   * Scans text for PII and returns detected types.
   */
  detect(text: string): string[] {
    const detected: Set<string> = new Set()

    if (this.patterns.email.test(text)) detected.add('EMAIL')
    if (this.patterns.phone.test(text)) detected.add('PHONE')
    if (this.patterns.ssn.test(text)) detected.add('SSN')
    if (this.patterns.creditCard.test(text)) detected.add('CREDIT_CARD')

    return Array.from(detected)
  }

  /**
   * Redacts PII from text using a replacement character.
   */
  redact(text: string, char = '█'): string {
    let redacted = text

    redacted = redacted.replace(this.patterns.email, (match) => char.repeat(match.length))
    redacted = redacted.replace(this.patterns.phone, (match) => char.repeat(match.length))
    redacted = redacted.replace(this.patterns.ssn, () => 'XXX-XX-XXXX') // Standard SSN redaction
    redacted = redacted.replace(this.patterns.creditCard, () => '****-****-****-****')

    return redacted
  }
}

export const privacyService = PrivacyService.getInstance()
