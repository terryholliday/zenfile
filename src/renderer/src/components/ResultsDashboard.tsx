import { useState } from 'react';
import { motion } from 'framer-motion';
import { useScanStore } from '../store/useScanStore';
import { ResultsList } from './ResultsList';

export function ResultsDashboard() {
    const { duplicates, largeFiles } = useScanStore();
    const [view, setView] = useState<'duplicates' | 'large'>('duplicates');

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
        <div className="flex flex-col h-full bg-transparent">
            {/* Header / Summary */}
            <div className="p-6 bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.7)]">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Scan Report</p>
                        <h2 className="text-3xl font-bold text-white drop-shadow-[0_6px_20px_rgba(59,130,246,0.25)]">Scan Results</h2>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-300 bg-white/10 border border-white/10 rounded-full px-3 py-1 backdrop-blur">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" />
                        Live index ready
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <motion.button
                        onClick={() => setView('duplicates')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative overflow-hidden p-5 rounded-xl border text-left transition-colors backdrop-blur-xl ${view === 'duplicates' ? 'bg-gradient-to-br from-indigo-500/25 via-purple-500/20 to-blue-500/20 border-indigo-400/60 shadow-[0_25px_60px_-32px_rgba(99,102,241,0.6)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                        <div className="relative">
                            <div className="text-sm text-neutral-300">Duplicates</div>
                            <div className="text-3xl font-mono text-indigo-200">{stats.dupCount} Groups</div>
                            <div className="text-xs text-neutral-200/80 mt-2">
                                Potential Savings: {formatBytes(stats.dupSize)}
                            </div>
                        </div>
                        <div className="absolute -right-8 -bottom-12 h-28 w-28 rounded-full bg-indigo-400/15 blur-2xl" />
                    </motion.button>

                    <motion.button
                        onClick={() => setView('large')}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={`relative overflow-hidden p-5 rounded-xl border text-left transition-colors backdrop-blur-xl ${view === 'large' ? 'bg-gradient-to-br from-amber-500/25 via-orange-500/20 to-rose-400/20 border-amber-400/70 shadow-[0_25px_60px_-32px_rgba(234,179,8,0.55)]' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    >
                        <div className="relative">
                            <div className="text-sm text-neutral-300">Large Files</div>
                            <div className="text-3xl font-mono text-amber-200">{stats.largeCount} Files</div>
                            <div className="text-xs text-neutral-200/80 mt-2">
                                Total Size: {formatBytes(stats.largeSize)}
                            </div>
                        </div>
                        <div className="absolute -right-10 -bottom-16 h-32 w-32 rounded-full bg-amber-400/15 blur-2xl" />
                    </motion.button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-5">
                <div className="relative h-full bg-white/5 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-xl shadow-[0_30px_70px_-40px_rgba(0,0,0,0.75)]">
                    <div className="absolute inset-x-6 top-0 h-16 bg-gradient-to-b from-white/8 to-transparent pointer-events-none" />
                    {view === 'duplicates' && (
                        <div className="h-full flex flex-col">
                            {/* In a real app we would group these visually. For MVP list. */}
                            <div className="p-3 bg-white/5 border-b border-white/10 text-xs text-neutral-200/90 flex justify-between backdrop-blur">
                                <span>Found {duplicateFiles.length} files in {duplicates.length} clusters</span>
                                <span className="text-indigo-200">Highlighting possible reclaim</span>
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
        </div>
    );
}
