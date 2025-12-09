import { motion } from 'framer-motion'
import { DuplicateCluster, FileNode } from '../../../shared/types'

interface DuplicateComparisonProps {
  cluster: DuplicateCluster
  onKeep: (fileId: string) => void
  onClose: () => void
}

export function DuplicateComparison({ cluster, onKeep, onClose }: DuplicateComparisonProps) {
  // Simple heuristic for "AI" recommendation
  // Higher score = better to keep
  const getScore = (file: FileNode, allFiles: FileNode[]) => {
    let score = 0
    const path = file.path.toLowerCase()

    // Prefer shorter paths (usually nearer to root/organized)
    score -= path.length

    // Prefer known organizational folders
    if (path.includes('documents')) score += 50
    if (path.includes('desktop')) score += 30
    if (path.includes('pictures')) score += 40
    if (path.includes('music')) score += 40

    // Penalize temporary/clutter folders
    if (path.includes('downloads')) score -= 50
    if (path.includes('temp')) score -= 100
    if (path.includes('copy')) score -= 20

    return score
  }

  const recommendFileId = cluster.files.reduce((best, current) => {
    return getScore(current, cluster.files) > getScore(best, cluster.files) ? current : best
  }, cluster.files[0]).id

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-8 bg-black/80 backdrop-blur-sm"
    >
      <div className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 glass-header border-b border-white/5 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-white">Smart Compare</h2>
              {cluster.type === 'SEMANTIC' && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-widest">
                  Semantic Match
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-400 font-mono mt-1">
              {cluster.type === 'SEMANTIC' ? 'Content Similarity Detected' : cluster.files[0].name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Comparison Grid */}
        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-6 h-full pb-4 min-w-max">
            {cluster.files.map((file) => {
              const isRecommended = file.id === recommendFileId
              return (
                <div
                  key={file.id}
                  className={`w-80 flex flex-col rounded-xl border-2 transition-all relative ${isRecommended ? 'border-indigo-500 bg-indigo-500/5 shadow-lg shadow-indigo-500/10' : 'border-neutral-800 bg-neutral-800/20'}`}
                >
                  {isRecommended && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-lg whitespace-nowrap">
                      {cluster.type === 'SEMANTIC' ? 'Best Version' : 'Zen AI Recommendation'}
                    </div>
                  )}

                  <div className="p-6 flex-1 flex flex-col gap-4">
                    <div>
                      <div className="text-xs text-neutral-500 uppercase font-bold mb-1">
                        Location
                      </div>
                      <div
                        className="text-sm text-neutral-200 font-mono break-words leading-relaxed"
                        title={file.path}
                      >
                        {file.path}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-neutral-500 uppercase font-bold mb-1">Size</div>
                      <div className="text-sm text-neutral-300">
                        {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>

                    {isRecommended ? (
                      <div className="mt-auto p-3 bg-indigo-500/10 rounded-lg border border-indigo-500/20">
                        <p className="text-xs text-indigo-300">
                          Creating harmony: This file seems to be in a more permanent location.
                        </p>
                      </div>
                    ) : (
                      <div className="mt-auto"></div>
                    )}
                  </div>

                  <div className="p-4 border-t border-white/5 bg-white/5">
                    <button
                      onClick={() => onKeep(file.id)}
                      className={`w-full py-3 rounded-lg font-bold text-sm transition-all ${isRecommended ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg' : 'bg-neutral-700 hover:bg-neutral-600 text-neutral-300'}`}
                    >
                      {isRecommended ? 'Keep This One' : 'Keep Anyway'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
