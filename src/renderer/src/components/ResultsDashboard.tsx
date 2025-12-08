import { useState } from 'react';
import { useScanStore } from '../store/useScanStore';
import { ResultsList } from './ResultsList';
import { ZenFlow } from './ZenFlow';

export function ResultsDashboard() {
    const { duplicates, largeFiles } = useScanStore();
    const [view, setView] = useState<'duplicates' | 'large'>('duplicates');
    const [duplicateMode, setDuplicateMode] = useState<'flow' | 'list'>('flow');

    // Flatten duplicates for the list
    // Each duplicate cluster has multiple files. 
    // We want to show THE DUPLICATES (excluding the "original"? or just all?)
    // For safety, users typically want to select which to keep.
    // ResultsList expects FileNode[].

    // For this MVP view, let's just show ALL files in duplicate clusters.
    const duplicateFiles = duplicates.flatMap(c => c.files);

    const stats = {
        dupCount: duplicates.length,
        dupSize: duplicates.reduce((acc, c) => acc + (c.files[0]?.sizeBytes || 0) * (c.files.length - 1), 0),
        largeCount: largeFiles.length,
        largeSize: largeFiles.reduce((acc, f) => acc + f.sizeBytes, 0)
    };

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="flex flex-col h-full bg-neutral-900">
            {/* Header / Summary */}
            <div className="p-6 bg-neutral-800 border-b border-neutral-700">
                <h2 className="text-2xl font-bold text-white mb-4">Scan Results</h2>

                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => setView('duplicates')}
                        className={`p-4 rounded-lg border text-left transition-colors ${view === 'duplicates' ? 'bg-indigo-900/20 border-indigo-500' : 'bg-neutral-700/50 border-transparent hover:bg-neutral-700'}`}
                    >
                        <div className="text-sm text-neutral-400">Duplicates</div>
                        <div className="text-2xl font-mono text-indigo-400">{stats.dupCount} Groups</div>
                        <div className="text-xs text-neutral-500 mt-1">
                            Potential Savings: {formatBytes(stats.dupSize)}
                        </div>
                    </button>

                    <button
                        onClick={() => setView('large')}
                        className={`p-4 rounded-lg border text-left transition-colors ${view === 'large' ? 'bg-amber-900/20 border-amber-500' : 'bg-neutral-700/50 border-transparent hover:bg-neutral-700'}`}
                    >
                        <div className="text-sm text-neutral-400">Large Files</div>
                        <div className="text-2xl font-mono text-amber-400">{stats.largeCount} Files</div>
                        <div className="text-xs text-neutral-500 mt-1">
                            Total Size: {formatBytes(stats.largeSize)}
                        </div>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-4">
                <div className="h-full bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                    {view === 'duplicates' && (
                        <div className="h-full flex flex-col">
                            <div className="p-3 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-300 flex justify-between items-center">
                                <div>
                                    <span className="text-neutral-500">Found {duplicateFiles.length} files in {duplicates.length} clusters</span>
                                </div>
                                <div className="flex items-center gap-2 text-[11px]">
                                    <span className="text-neutral-500">Mode</span>
                                    <div className="inline-flex rounded-full border border-neutral-700 bg-neutral-950 p-1">
                                        <button
                                            onClick={() => setDuplicateMode('flow')}
                                            className={`px-3 py-1 rounded-full ${duplicateMode === 'flow' ? 'bg-indigo-600 text-white shadow' : 'text-neutral-400 hover:text-neutral-200'}`}
                                        >
                                            Zen Flow
                                        </button>
                                        <button
                                            onClick={() => setDuplicateMode('list')}
                                            className={`px-3 py-1 rounded-full ${duplicateMode === 'list' ? 'bg-neutral-800 text-white shadow-inner' : 'text-neutral-400 hover:text-neutral-200'}`}
                                        >
                                            Table
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {duplicateMode === 'flow' ? (
                                <ZenFlow duplicateClusters={duplicates} largeFiles={largeFiles} />
                            ) : (
                                <ResultsList files={duplicateFiles} />
                            )}
                        </div>
                    )}

                    {view === 'large' && (
                        <div className="h-full flex flex-col">
                            <ResultsList files={largeFiles} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
