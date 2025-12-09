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

      // Basic Schema Version Check
      if (loaded.schemaVersion !== SCHEMA_VERSION) {
        logger.warn(
          `Schema version mismatch. Loaded: ${loaded.schemaVersion}, Current: ${SCHEMA_VERSION}. Migrating...`
        )
        // Logic for migration would go here. For now, we merge with defaults to ensure safety.
        this.settings = { ...this.getDefaultSettings(), ...loaded, schemaVersion: SCHEMA_VERSION }
        await this.save(this.settings)
      } else {
        this.settings = loaded
      }
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        logger.error('Failed to load settings', { error: (error as Error).message })
      }
      // If file missing or error, use defaults
      this.settings = this.getDefaultSettings()
      await this.save(this.settings)
    }

    return this.settings
  }

  async save(newSettings: SettingsSchema): Promise<void> {
    try {
      this.settings = newSettings
      await fs.writeFile(this.filePath, JSON.stringify(this.settings, null, 2), 'utf-8')
      logger.info('Settings saved')
    } catch (error) {
      logger.error('Failed to save settings', { error: (error as Error).message })
      throw error
    }
  }

  get(): SettingsSchema {
    return this.settings || this.getDefaultSettings()
  }
}

export const settingsStore = new SettingsStore()
