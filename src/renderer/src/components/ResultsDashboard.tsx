import { useState } from 'react';
import { useScanStore } from '../store/useScanStore';
import { ResultsList } from './ResultsList';

export function ResultsDashboard() {
    const { duplicates, largeFiles, aiRecommendations } = useScanStore();
    const [view, setView] = useState<'duplicates' | 'large' | 'ai'>('duplicates');

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
        largeSize: largeFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
        aiCount: aiRecommendations.length
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

                <div className="grid grid-cols-3 gap-4">
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

                    <button
                        onClick={() => setView('ai')}
                        className={`p-4 rounded-lg border text-left transition-colors ${view === 'ai' ? 'bg-emerald-900/20 border-emerald-500' : 'bg-neutral-700/50 border-transparent hover:bg-neutral-700'}`}
                    >
                        <div className="text-sm text-neutral-400">AI Recommendations</div>
                        <div className="text-2xl font-mono text-emerald-400">{stats.aiCount} Picks</div>
                        <div className="text-xs text-neutral-500 mt-1">
                            Smart keep suggestions based on names
                        </div>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-4">
                <div className="h-full bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden">
                    {view === 'duplicates' && (
                        <div className="h-full flex flex-col">
                            {/* In a real app we would group these visually. For MVP list. */}
                            <div className="p-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 flex justify-between">
                                <span>Found {duplicateFiles.length} files in {duplicates.length} clusters</span>
                            </div>
                            <ResultsList files={duplicateFiles} />
                        </div>
                    )}

                    {view === 'large' && (
                        <div className="h-full flex flex-col">
                            <ResultsList files={largeFiles} />
                        </div>
                    )}

                    {view === 'ai' && (
                        <div className="h-full flex flex-col overflow-hidden">
                            <div className="p-2 bg-neutral-900 border-b border-neutral-800 text-xs text-neutral-500 flex justify-between">
                                <span>{aiRecommendations.length === 0 ? 'No AI recommendations yet' : `${aiRecommendations.length} recommendation${aiRecommendations.length > 1 ? 's' : ''} available`}</span>
                                <span className="text-emerald-400">Name similarity driven</span>
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-3 p-4">
                                {aiRecommendations.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-neutral-500 text-sm">
                                        Run a scan to see AI-backed keep suggestions.
                                    </div>
                                )}
                                {aiRecommendations.map(rec => {
                                    const recommended = rec.similarFiles.find(f => f.id === rec.recommendedFileId);
                                    return (
                                        <div key={rec.id} className="border border-neutral-800 bg-neutral-900 rounded-lg p-3 space-y-2 shadow-inner">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <div className="text-xs uppercase tracking-wide text-neutral-500">Recommended keep</div>
                                                    <div className="text-white font-semibold truncate">{recommended?.name || 'File'}</div>
                                                </div>
                                                <div className="text-xs text-emerald-300">{Math.round(rec.similarity * 100)}% name match</div>
                                            </div>
                                            <div className="text-neutral-400 text-sm leading-relaxed">{rec.reason}</div>
                                            <div className="text-xs text-neutral-500">Similar options</div>
                                            <div className="space-y-1">
                                                {rec.similarFiles.map(file => (
                                                    <div
                                                        key={file.id}
                                                        className={`flex items-center justify-between text-xs px-2 py-1 rounded ${file.id === rec.recommendedFileId ? 'bg-emerald-900/40 text-emerald-200' : 'text-neutral-300'}`}
                                                    >
                                                        <div className="truncate pr-2">{file.name}</div>
                                                        <div className="text-neutral-500 ml-2">{formatBytes(file.sizeBytes)}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
