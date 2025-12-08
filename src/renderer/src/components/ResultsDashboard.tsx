import { useState } from 'react'
import { useScanStore } from '../store/useScanStore'
import { ResultsList } from './ResultsList'
import { ZenGalaxy } from './ZenGalaxy'
import { DuplicateComparison } from './DuplicateComparison'
import { DuplicateCluster, FileNode } from '../../../shared/types'
import { AnimatePresence } from 'framer-motion'

export function ResultsDashboard() {
  const { duplicates, largeFiles, actionTrash } = useScanStore()
  const [view, setView] = useState<'duplicates' | 'large'>('duplicates')
  const [visualMode, setVisualMode] = useState<'list' | 'galaxy'>('galaxy') // Default to WOW mode
  const [selectedCluster, setSelectedCluster] = useState<DuplicateCluster | null>(null)

  // Flatten duplicates for the list
  const duplicateFiles = duplicates.flatMap(c => c.files)

  const stats = {
    dupCount: duplicates.length,
    dupSize: duplicates.reduce((acc, c) => acc + (c.files[0]?.sizeBytes || 0) * (c.files.length - 1), 0),
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

  const handleKeepFile = (fileId: string) => {
    if (!selectedCluster) return;
    // Find all OTHER files in this cluster to trash
    const filesToTrash = selectedCluster.files
      .filter(f => f.id !== fileId)
      .map(f => f.id);

    if (filesToTrash.length > 0) {
      actionTrash(filesToTrash);
    }
    setSelectedCluster(null);
  };

  const handleFileSelect = (file: FileNode) => {
    if (view === 'duplicates') {
      const cluster = duplicates.find(c => c.files.some(f => f.id === file.id));
      if (cluster) setSelectedCluster(cluster);
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <AnimatePresence>
        {selectedCluster && (
          <DuplicateComparison
            cluster={selectedCluster}
            onKeep={handleKeepFile}
            onClose={() => setSelectedCluster(null)}
          />
        )}
      </AnimatePresence>

      {/* Header / Summary */}
      <div className="p-6 glass-header border-b border-white/5 flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-4 drop-shadow-md">Scan Results</h2>

          <div className="flex gap-4">
            <button
              onClick={() => setView('duplicates')}
              className={`p-4 rounded-xl border text-left transition-all ${view === 'duplicates' && visualMode === 'list' ? 'bg-indigo-500/20 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
            >
              <div className="text-xs uppercase font-bold text-neutral-400">Duplicates</div>
              <div className="text-2xl font-mono text-indigo-300">{stats.dupCount} Groups</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                Potential Savings: {formatBytes(stats.dupSize)}
              </div>
            </button>

            <button
              onClick={() => setView('large')}
              className={`p-4 rounded-xl border text-left transition-all ${view === 'large' && visualMode === 'list' ? 'bg-amber-500/20 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.3)]' : 'bg-white/5 border-transparent hover:bg-white/10'}`}
            >
              <div className="text-xs uppercase font-bold text-neutral-400">Large Files</div>
              <div className="text-2xl font-mono text-amber-300">{stats.largeCount} Files</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                Total Size: {formatBytes(stats.largeSize)}
              </div>
            </button>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
          <button
            onClick={() => setVisualMode('galaxy')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${visualMode === 'galaxy' ? 'bg-indigo-500 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
          >
            Zen Galaxy
          </button>
          <button
            onClick={() => setVisualMode('list')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${visualMode === 'list' ? 'bg-white/10 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
          >
            List View
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {visualMode === 'galaxy' ? (
          <ZenGalaxy onClusterSelect={setSelectedCluster} />
        ) : (
          <div className="absolute inset-0 p-4">
            <div className="h-full bg-neutral-950/50 rounded-lg border border-white/5 overflow-hidden backdrop-blur-sm">
              {view === 'duplicates' && (
                <div className="h-full flex flex-col">
                  <div className="p-2 bg-white/5 border-b border-white/5 text-xs text-neutral-400 flex justify-between">
                    <span>
                      Found {duplicateFiles.length} files in {duplicates.length} clusters
                    </span>
                  </div>
                  <ResultsList files={duplicateFiles} onSelect={handleFileSelect} />
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
