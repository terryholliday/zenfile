import { useState } from 'react'
import { useScanStore } from '../store/useScanStore'
import { ResultsList } from './ResultsList'
import { ZenGalaxy } from './ZenGalaxy'

export function ResultsDashboard() {
  const { duplicates, largeFiles } = useScanStore()
  const [view, setView] = useState<'duplicates' | 'large'>('duplicates')
  const [visualMode, setVisualMode] = useState<'list' | 'galaxy'>('galaxy') // Default to WOW mode

  // Flatten duplicates for the list
  const duplicateFiles = duplicates.flatMap((c) => c.files)

  const stats = {
    dupCount: duplicates.length,
    dupSize: duplicates.reduce(
      (acc, c) => acc + (c.files[0]?.sizeBytes || 0) * (c.files.length - 1),
      0
    ),
    largeCount: largeFiles.length,
    largeSize: largeFiles.reduce((acc, f) => acc + f.sizeBytes, 0)
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col h-full bg-neutral-900">
      {/* Header / Summary */}
      <div className="p-6 bg-neutral-800 border-b border-neutral-700 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4">Scan Results</h2>

          <div className="flex gap-4">
            <button
              onClick={() => setView('duplicates')}
              className={`p-4 rounded-lg border text-left transition-colors ${view === 'duplicates' && visualMode === 'list' ? 'bg-indigo-900/20 border-indigo-500' : 'bg-neutral-700/50 border-transparent hover:bg-neutral-700'}`}
            >
              <div className="text-sm text-neutral-400">Duplicates</div>
              <div className="text-2xl font-mono text-indigo-400">{stats.dupCount} Groups</div>
              <div className="text-xs text-neutral-500 mt-1">
                Potential Savings: {formatBytes(stats.dupSize)}
              </div>
            </button>

            <button
              onClick={() => setView('large')}
              className={`p-4 rounded-lg border text-left transition-colors ${view === 'large' && visualMode === 'list' ? 'bg-amber-900/20 border-amber-500' : 'bg-neutral-700/50 border-transparent hover:bg-neutral-700'}`}
            >
              <div className="text-sm text-neutral-400">Large Files</div>
              <div className="text-2xl font-mono text-amber-400">{stats.largeCount} Files</div>
              <div className="text-xs text-neutral-500 mt-1">
                Total Size: {formatBytes(stats.largeSize)}
              </div>
            </button>
          </div>
        </div>

        {/* View/Galaxy Toggle */}
        <div className="flex bg-neutral-950 p-1 rounded-lg border border-neutral-700">
          <button
            onClick={() => setVisualMode('list')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${visualMode === 'list' ? 'bg-neutral-700 text-white' : 'text-neutral-500 hover:text-white'}`}
          >
            List View
          </button>
          <button
            onClick={() => setVisualMode('galaxy')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${visualMode === 'galaxy' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-neutral-500 hover:text-white'}`}
          >
            <span>✨ Zen Galaxy</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {visualMode === 'galaxy' ? (
          <div className="absolute inset-0">
            <ZenGalaxy />
          </div>
        ) : (
          <div className="absolute inset-0 p-4">
            <div className="h-full bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
              {view === 'duplicates' && (
                <div className="h-full flex flex-col">
                  <div className="p-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 flex justify-between">
                    <span>
                      Found {duplicateFiles.length} files in {duplicates.length} clusters
                    </span>
                  </div>
                  <ResultsList files={duplicateFiles} />
                </div>
              )}

              {view === 'large' && (
                <div className="h-full flex flex-col">
                  <ResultsList files={largeFiles} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
