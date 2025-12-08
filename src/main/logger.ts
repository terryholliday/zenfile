// Imports removed as they were unused

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

export function log(level: LogLevel, message: string, data?: Record<string, any>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    pid: process.pid,
    message,
    ...data
  }

  // In production, this would append to a file. For now, console.
  console.log(JSON.stringify(entry))
}

export const logger = {
  info: (msg: string, data?: any) => log('INFO', msg, data),
  warn: (msg: string, data?: any) => log('WARN', msg, data),
  error: (msg: string, data?: any) => log('ERROR', msg, data),
  debug: (msg: string, data?: any) => log('DEBUG', msg, data)
}
