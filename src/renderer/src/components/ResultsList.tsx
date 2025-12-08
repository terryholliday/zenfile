import { memo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { FileNode } from '../../../shared/types';
import { useScanStore } from '../store/useScanStore';

interface ResultsListProps {
    files: FileNode[];
}

const ResultRow = memo(({ file, index, onTrash, onQuarantine }: {
    file: FileNode, index: number, onTrash: (e: any, id: string) => void, onQuarantine: (e: any, id: string) => void
}) => (
    <div className="flex items-center gap-4 p-2 border-b border-neutral-800 hover:bg-neutral-800/50 text-sm group">
        <div className="w-8 text-neutral-500 text-xs text-right">{index + 1}</div>

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
));

export function ResultsList({ files }: ResultsListProps) {
    const { actionTrash, actionQuarantine } = useScanStore();

    if (files.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-neutral-500">
                No files found.
            </div>
        );
    }

    const handleTrash = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm("Move to Trash?")) {
            actionTrash([id]);
        }
    };

    const handleQuarantine = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        actionQuarantine([id]);
    };

    return (
        <div className="h-full w-full bg-neutral-900">
            <Virtuoso
                style={{ height: '100%' }}
                data={files}
                itemContent={(index, file) => (
                    <ResultRow
                        index={index}
                        file={file}
                        onTrash={handleTrash}
                        onQuarantine={handleQuarantine}
                    />
                )}
            />
        </div>
    );
}
