import { useScanStore } from '../store/useScanStore'
import { clsx } from 'clsx'
import { useState } from 'react'

export function SettingsDashboard() {
  const { settings, updateSettings } = useScanStore()
  const [newExclude, setNewExclude] = useState('')

  if (!settings) return null

  const handleAddExclude = () => {
    if (!newExclude) return
    updateSettings({
      excludePaths: [...settings.excludePaths, newExclude]
    })
    setNewExclude('')
  }

  const handleRemoveExclude = (pathToRemove: string) => {
    updateSettings({
      excludePaths: settings.excludePaths.filter((p) => p !== pathToRemove)
    })
  }

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Settings</h2>
        <p className="text-neutral-400">Configure scanning rules and safety limits.</p>
      </header>

      {/* Scan Criteria */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-indigo-400 uppercase tracking-wider text-xs">
          Scan Criteria
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-neutral-800/50 p-6 rounded-lg border border-neutral-700">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Large File Threshold (MB)
            </label>
            <p className="text-xs text-neutral-500 mb-4">Files larger than this will be flagged.</p>
            <input
              type="number"
              value={settings.maxFileMb}
              onChange={(e) => updateSettings({ maxFileMb: parseInt(e.target.value) || 0 })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>

          <div className="bg-neutral-800/50 p-6 rounded-lg border border-neutral-700">
            <label className="block text-sm font-medium text-neutral-300 mb-2">
              Stale File Threshold (Years)
            </label>
            <p className="text-xs text-neutral-500 mb-4">
              Files explicitly older than this will be flagged.
            </p>
            <input
              type="number"
              value={settings.staleYears}
              onChange={(e) => updateSettings({ staleYears: parseFloat(e.target.value) || 0 })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>
      </section>

      {/* Intelligence */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-purple-400 uppercase tracking-wider text-xs">
          Intelligence
        </h3>

        <div className="bg-neutral-800/50 p-6 rounded-lg border border-neutral-700 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <label className="block text-base font-medium text-white">Deep Scan OCR</label>
              <span className="bg-purple-500/20 text-purple-300 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider">Experimental</span>
            </div>
            <p className="text-sm text-neutral-400 max-w-lg">
              Use AI vision to read text inside images (screenshots, scanned docs).
              <br />
              <span className="text-yellow-500/80 text-xs">⚠️ May significantly increase scan time.</span>
            </p>
          </div>
          <button
            onClick={() => updateSettings({ enableOcr: !settings.enableOcr })}
            className={clsx(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-neutral-900',
              settings.enableOcr ? 'bg-purple-600' : 'bg-neutral-700'
            )}
          >
            <span
              className={clsx(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.enableOcr ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </section>

      {/* Safety */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-emerald-400 uppercase tracking-wider text-xs">
          Safety
        </h3>

        <div className="bg-neutral-800/50 p-6 rounded-lg border border-neutral-700 flex items-center justify-between">
          <div>
            <label className="block text-base font-medium text-white mb-1">Dry Run Mode</label>
            <p className="text-sm text-neutral-400">
              Perform actions (Trash/Quarantine) without actually modifying files.
            </p>
          </div>
          <button
            onClick={() => updateSettings({ dryRun: !settings.dryRun })}
            className={clsx(
              'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-neutral-900',
              settings.dryRun ? 'bg-indigo-600' : 'bg-neutral-700'
            )}
          >
            <span
              className={clsx(
                'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                settings.dryRun ? 'translate-x-6' : 'translate-x-1'
              )}
            />
          </button>
        </div>
      </section>

      {/* Excluded Paths */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-red-400 uppercase tracking-wider text-xs">
          Excluded Paths
        </h3>
        <div className="bg-neutral-800/50 p-6 rounded-lg border border-neutral-700 space-y-4">
          <p className="text-sm text-neutral-400">
            These folders will be completely ignored during scans.
          </p>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g., node_modules, .git"
              value={newExclude}
              onChange={(e) => setNewExclude(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddExclude()}
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
            <button
              onClick={handleAddExclude}
              className="px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors"
            >
              Add
            </button>
          </div>

          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {settings.excludePaths.map((path) => (
              <li
                key={path}
                className="flex items-center justify-between bg-neutral-900/50 px-3 py-2 rounded border border-neutral-800 group"
              >
                <span className="text-sm text-neutral-300 font-mono">{path}</span>
                <button
                  onClick={() => handleRemoveExclude(path)}
                  className="text-neutral-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  Remove
                </button>
              </li>
            ))}
            {settings.excludePaths.length === 0 && (
              <li className="text-sm text-neutral-500 italic">No exclusions set.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  )
}
