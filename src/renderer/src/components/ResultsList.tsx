import { memo } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { FileNode } from '../../../shared/types'
import { useScanStore } from '../store/useScanStore'

interface ResultsListProps {
  files: FileNode[]
  onSelect?: (file: FileNode) => void
}

const ResultRow = memo(
  ({
    file,
    index,
    onTrash,
    onQuarantine,
    onSelect
  }: {
    file: FileNode
    index: number
    onTrash: (e: any, id: string) => void
    onQuarantine: (e: any, id: string) => void
    onSelect?: (file: FileNode) => void
  }) => (
    <div
      onClick={() => onSelect?.(file)}
      className={`flex items-center gap-4 p-2 border-b border-white/5 hover:bg-white/5 text-sm group transition-colors ${onSelect ? 'cursor-pointer' : ''}`}
    >
      <div className="w-8 text-neutral-500 text-xs text-right">{index + 1}</div>

      <div className="flex-1 truncate">
        <div className="text-neutral-200 truncate font-medium group-hover:text-white transition-colors">{file.name}</div>
        <div className="text-neutral-500 text-xs truncate font-mono opacity-70">{file.path}</div>
      </div>

      <div className="w-24 text-right text-indigo-300 font-mono text-xs">
        {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
      </div>

      {/* Actions: Hidden by default, shown on hover */}
      <div className="w-32 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => onQuarantine(e, file.id)}
          className="px-2 py-1 bg-amber-500/10 text-amber-500 text-xs rounded hover:bg-amber-500/20 transition-colors"
          title="Quarantine"
        >
          Q
        </button>
        <button
          onClick={(e) => onTrash(e, file.id)}
          className="px-2 py-1 bg-red-500/10 text-red-400 text-xs rounded hover:bg-red-500/20 transition-colors"
          title="Trash"
        >
          Trash
        </button>
      </div>
    </div>
  )
)

export function ResultsList({ files, onSelect }: ResultsListProps) {
  const { actionTrash, actionQuarantine } = useScanStore()

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-neutral-500 animate-pulse">
        <div className="text-4xl mb-4">📭</div>
        <p className="font-medium">No files found</p>
      </div>
    )
  }

  const handleTrash = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (confirm('Move to Trash?')) {
      actionTrash([id])
    }
  }

  const handleQuarantine = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    actionQuarantine([id])
  }

  return (
    <div className="h-full w-full bg-transparent">
      <Virtuoso
        style={{ height: '100%' }}
        data={files}
        itemContent={(index, file) => (
          <ResultRow
            index={index}
            file={file}
            onTrash={handleTrash}
            onQuarantine={handleQuarantine}
            onSelect={onSelect}
          />
        )}
      />
    </div>
  )
}
