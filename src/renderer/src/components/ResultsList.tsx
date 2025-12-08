import { memo, useMemo, useState } from 'react'
import { Virtuoso } from 'react-virtuoso'
import { FileNode } from '../../../shared/types'
import { useScanStore } from '../store/useScanStore'

interface ResultsListProps {
  files: FileNode[]
}

const ResultRow = memo(
  ({
    file,
    index,
    onTrash,
    onQuarantine,
    selected,
    onToggle
  }: {
    file: FileNode
    index: number
    onTrash: (e: any, id: string) => void
    onQuarantine: (e: any, id: string) => void
    selected: boolean
    onToggle: () => void
  }) => (
    <div
      className={`flex items-center gap-4 p-2 border-b border-neutral-800 hover:bg-neutral-800/50 text-sm group ${selected ? 'bg-neutral-800/70' : ''}`}
    >
      <div className="w-8 text-neutral-500 text-xs text-right">{index + 1}</div>

      <div className="pl-1">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 accent-indigo-500"
          aria-label={`Select ${file.name}`}
        />
      </div>

      <div className="flex-1 truncate">
        <div className="text-neutral-200 truncate font-medium">{file.name}</div>
        <div className="text-neutral-500 text-xs truncate">{file.path}</div>
      </div>

      <div className="w-24 text-right text-indigo-400 font-mono text-xs">
        {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
      </div>

      {/* Actions: Hidden by default, shown on hover */}
      <div className="w-32 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => onQuarantine(e, file.id)}
          className="px-2 py-1 bg-amber-900/30 text-amber-500 text-xs rounded hover:bg-amber-900/50"
          title="Quarantine"
        >
          Q
        </button>
        <button
          onClick={(e) => onTrash(e, file.id)}
          className="px-2 py-1 bg-red-900/30 text-red-500 text-xs rounded hover:bg-red-900/50"
          title="Trash"
        >
          Trash
        </button>
      </div>
    </div>
  )
)

export function ResultsList({ files }: ResultsListProps) {
  const { actionTrash, actionQuarantine } = useScanStore()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-500">
        No files found.
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

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedCount = selectedIds.size
  const hasSelection = selectedCount > 0
  const selectedIdsArray = useMemo(() => Array.from(selectedIds), [selectedIds])

  const handleTrashSelected = () => {
    if (!hasSelection) return
    if (confirm(`Move ${selectedCount} file(s) to Trash?`)) {
      actionTrash(selectedIdsArray)
      setSelectedIds(new Set())
    }
  }

  const handleQuarantineSelected = () => {
    if (!hasSelection) return
    actionQuarantine(selectedIdsArray)
    setSelectedIds(new Set())
  }

  const selectAll = () => setSelectedIds(new Set(files.map((f) => f.id)))
  const clearSelection = () => setSelectedIds(new Set())

  return (
    <div className="h-full w-full bg-neutral-900">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 text-xs text-neutral-300 bg-neutral-950">
        <div className="flex items-center gap-3">
          <button
            onClick={selectAll}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
          >
            Select All
          </button>
          <button
            onClick={clearSelection}
            className="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 border border-neutral-700"
          >
            Clear
          </button>
          <span className="text-neutral-500">{selectedCount} selected</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleQuarantineSelected}
            disabled={!hasSelection}
            className={`px-3 py-1 rounded text-xs border ${hasSelection ? 'bg-amber-900/40 text-amber-400 border-amber-700 hover:bg-amber-900/60' : 'bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed'}`}
          >
            Quarantine Selected
          </button>
          <button
            onClick={handleTrashSelected}
            disabled={!hasSelection}
            className={`px-3 py-1 rounded text-xs border ${hasSelection ? 'bg-red-900/40 text-red-400 border-red-700 hover:bg-red-900/60' : 'bg-neutral-900 text-neutral-600 border-neutral-800 cursor-not-allowed'}`}
          >
            Trash Selected
          </button>
        </div>
      </div>

      <Virtuoso
        style={{ height: '100%' }}
        data={files}
        itemContent={(index, file) => (
          <ResultRow
            index={index}
            file={file}
            onTrash={handleTrash}
            onQuarantine={handleQuarantine}
            selected={selectedIds.has(file.id)}
            onToggle={() => toggleSelected(file.id)}
          />
        )}
      />
    </div>
  )
}
