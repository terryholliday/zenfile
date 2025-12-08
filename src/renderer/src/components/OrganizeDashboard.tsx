import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrganizeStore } from '../store/useOrganizeStore'
import { useScanStore } from '../store/useScanStore'
import { clsx } from 'clsx'
import { SmartStack } from '../../../shared/types'

function StackCard({ stack, onExecute, onDismiss }: {
    stack: SmartStack,
    onExecute: (id: string) => void,
    onDismiss: (id: string) => void
}) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="p-4 glass-panel rounded-xl flex flex-col gap-3 group hover:bg-white/5 transition-colors"
        >
            <div className="flex justify-between items-start">
                <div>
                    <div className="text-xs uppercase tracking-wider text-indigo-300 font-bold mb-1">
                        {stack.type === 'FILE_TYPE' ? 'File Type' : 'Smart Cluster'}
                    </div>
                    <h3 className="text-lg font-bold text-white leading-tight">{stack.label}</h3>
                </div>
                <div className="text-xs font-mono text-neutral-400 bg-black/20 px-2 py-1 rounded">
                    {stack.files.length} files
                </div>
            </div>

            <div className="flex-1 min-h-[80px] bg-black/20 rounded-lg p-2 flex flex-col gap-1 overflow-hidden">
                {stack.files.slice(0, 3).map(f => (
                    <div key={f.id} className="text-xs text-neutral-300 truncate flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-neutral-500" />
                        {f.name}
                    </div>
                ))}
                {stack.files.length > 3 && (
                    <div className="text-[10px] text-neutral-500 italic pl-3">
                        + {stack.files.length - 3} more
                    </div>
                )}
            </div>

            <div className="flex gap-2 mt-auto pt-2">
                <button
                    onClick={() => onDismiss(stack.id)}
                    className="flex-1 py-2 rounded-lg text-xs font-bold text-neutral-400 hover:bg-white/5 transition-colors"
                >
                    Ignore
                </button>
                <button
                    onClick={() => onExecute(stack.id)}
                    className="flex-[2] py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                >
                    Make Folder
                </button>
            </div>
            export function OrganizeDashboard() {
    const {stacks, isAnalyzing, analyze, executeStack, dismissStack} = useOrganizeStore()
            const {files} = useScanStore(state => ({
                files: state.files
    }))

    // Auto-analyze when opened if data exists
    useEffect(() => {
        if (stacks.length === 0 && files.length > 0) {
                analyze(files)
            }
    }, [files])

            return (
            <div className="h-full p-6 overflow-hidden flex flex-col">
                <header className="mb-6">
                    <h2 className="text-3xl font-black text-white tracking-tight mb-2">Smart Stacks</h2>
                    <p className="text-neutral-400 max-w-xl">
                        AI-powered organization recommendations. Group loose files into logical folders with one click.
                    </p>
                </header>

                {isAnalyzing ? (
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
                        <div className="text-sm text-indigo-300 font-bold tracking-widest uppercase">Analyzing Context...</div>
                    </div>
                ) : stacks.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-10 scrollbar-hide">
                        <AnimatePresence>
                            {stacks.map(stack => (
                                <StackCard
                                    key={stack.id}
                                    stack={stack}
                                    onExecute={executeStack}
                                    onDismiss={dismissStack}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-neutral-500">
                        <div className="text-6xl mb-4 opacity-20">📂</div>
                        <p>No stacks found. Try scanning a messier folder!</p>
                    </div>
                )}
            </div>
            )
}
