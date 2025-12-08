import { memo } from 'react';
import { motion } from 'framer-motion';
import { Virtuoso } from 'react-virtuoso';
import { FileNode } from '../../../shared/types';
import { useScanStore } from '../store/useScanStore';

interface ResultsListProps {
    files: FileNode[];
}

const ResultRow = memo(({ file, index, onTrash, onQuarantine }: {
    file: FileNode, index: number, onTrash: (e: any, id: string) => void, onQuarantine: (e: any, id: string) => void
}) => (
    <motion.div
        whileHover={{ scale: 1.005, translateY: -1 }}
        className="flex items-center gap-4 p-3 border-b border-white/10 hover:bg-white/5 text-sm group backdrop-blur"
    >
        <div className="w-8 text-neutral-400 text-xs text-right">{index + 1}</div>

        <div className="flex-1 truncate">
            <div className="text-neutral-50 truncate font-medium">{file.name}</div>
            <div className="text-neutral-300/70 text-xs truncate">{file.path}</div>
        </div>

        <div className="w-24 text-right text-indigo-200 font-mono text-xs">
            {(file.sizeBytes / 1024 / 1024).toFixed(2)} MB
        </div>

        {/* Actions: Hidden by default, shown on hover */}
        <div className="w-36 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <motion.button
                onClick={(e) => onQuarantine(e, file.id)}
                whileHover={{ scale: 1.05 }}
                className="px-3 py-1 bg-gradient-to-r from-amber-600/30 to-orange-500/20 text-amber-100 text-xs rounded-lg border border-amber-400/30 shadow-[0_10px_25px_-20px_rgba(251,191,36,0.8)]"
                title="Quarantine"
            >
                Q
            </motion.button>
            <motion.button
                onClick={(e) => onTrash(e, file.id)}
                whileHover={{ scale: 1.05 }}
                className="px-3 py-1 bg-gradient-to-r from-red-600/30 to-rose-500/20 text-red-100 text-xs rounded-lg border border-red-400/40 shadow-[0_10px_25px_-20px_rgba(239,68,68,0.8)]"
                title="Trash"
            >
                Trash
            </motion.button>
        </div>
    </motion.div>
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
