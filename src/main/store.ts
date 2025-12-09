import { app } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import {
  SETTINGS_FILENAME,
  SCHEMA_VERSION,
  DEFAULT_MAX_FILE_MB,
  DEFAULT_STALE_YEARS,
  DEFAULT_INCLUDE_PATHS,
  DEFAULT_EXCLUDE_PATHS
} from '../shared/constants'
import { SettingsSchema } from '../shared/types'
import { logger } from './logger'

export class SettingsStore {
  private filePath: string
  private settings: SettingsSchema | null = null
  
  // FIX: Write Lock
  private isSaving = false
  private pendingSave: SettingsSchema | null = null

  constructor() {
    this.filePath = path.join(app.getPath('userData'), SETTINGS_FILENAME)
  }

  private getDefaultSettings(): SettingsSchema {
    return {
      schemaVersion: SCHEMA_VERSION,
      maxFileMb: DEFAULT_MAX_FILE_MB,
      staleYears: DEFAULT_STALE_YEARS,
      includePaths: DEFAULT_INCLUDE_PATHS,
      excludePaths: DEFAULT_EXCLUDE_PATHS,
      dryRun: true,
      isDarkTheme: true,
      enableOcr: false
    }
  }

  async load(): Promise<SettingsSchema> {
    if (this.settings) return this.settings

    try {
      const data = await fs.readFile(this.filePath, 'utf-8')
      const loaded = JSON.parse(data) as SettingsSchema

      if (loaded.schemaVersion !== SCHEMA_VERSION) {
        logger.warn(`Migrating settings v${loaded.schemaVersion} -> v${SCHEMA_VERSION}`)
        this.settings = { ...this.getDefaultSettings(), ...loaded, schemaVersion: SCHEMA_VERSION }
        await this.save(this.settings)
      } else {
        this.settings = loaded
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to load settings', { error: error.message })
      }
      this.settings = this.getDefaultSettings()
      await this.save(this.settings)
    }

    return this.settings
  }

  async save(newSettings: SettingsSchema): Promise<void> {
    this.settings = newSettings

    // Queue logic: If saving, mark pending.
    if (this.isSaving) {
        this.pendingSave = newSettings
        return
    }

    this.isSaving = true

    try {
        await this._writeToDisk(newSettings)
    } finally {
        this.isSaving = false
        // If a save came in while we were writing, process it now
        if (this.pendingSave) {
            const next = this.pendingSave
            this.pendingSave = null
            void this.save(next)
        }
    }
  }

  private async _writeToDisk(data: SettingsSchema): Promise<void> {
    try {
        // Atomic write via temp file (safer than direct overwrite)
        const tempPath = `${this.filePath}.tmp`
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8')
        await fs.rename(tempPath, this.filePath)
        logger.info('Settings saved')
    } catch (error: any) {
        logger.error('Failed to save settings', { error: error.message })
    }
  }

  get(): SettingsSchema {
    return this.settings || this.getDefaultSettings()
  }
}

export const settingsStore = new SettingsStore()
