import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ConciergeSuggestion {
    id: string;
    title: string;
    detail: string;
    actionLabel: string;
    secondaryAction?: string;
    type: 'insight' | 'sorting' | 'safety';
}

const SUGGESTIONS: ConciergeSuggestion[] = [
    {
        id: 'copy-cleanup',
        title: "Copy cleanup",
        detail: "I noticed you have 14 'Copy of' files. Want me to remove them?",
        actionLabel: 'Review & delete',
        secondaryAction: 'Ignore',
        type: 'insight'
    },
    {
        id: 'smart-sorting',
        title: 'Smart sorting',
        detail: "These 50 images look like screenshots. Move to 'Screenshots' folder?",
        actionLabel: 'Move screenshots',
        secondaryAction: 'Remind me later',
        type: 'sorting'
    },
    {
        id: 'safety-pass',
        title: 'Safety check',
        detail: 'I can quarantine suspicious downloads before you open them.',
        actionLabel: 'Enable quarantine',
        secondaryAction: 'Skip for now',
        type: 'safety'
    }
];

const typeColors: Record<ConciergeSuggestion['type'], string> = {
    insight: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/40',
    sorting: 'text-indigo-300 bg-indigo-500/10 ring-indigo-500/40',
    safety: 'text-amber-300 bg-amber-500/10 ring-amber-500/40'
};

export function AIConcierge() {
    const [open, setOpen] = useState(true);
    const [resolved, setResolved] = useState<string[]>([]);

    const nextSuggestion = useMemo(
        () => SUGGESTIONS.find(s => !resolved.includes(s.id)),
        [resolved]
    );

    const markResolved = (id: string) => {
        if (!resolved.includes(id)) {
            setResolved([...resolved, id]);
        }
    };

    const reset = () => setResolved([]);

    return (
        <div className="absolute bottom-6 right-6 z-30 max-w-sm w-[340px] select-text">
            <div className="flex items-center gap-3 mb-2 bg-neutral-900/70 backdrop-blur rounded-full px-3 py-2 border border-neutral-800 shadow-xl shadow-black/20">
                <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 via-emerald-400 to-amber-400 flex items-center justify-center text-sm font-bold text-neutral-900 ring-2 ring-indigo-500/40">
                        ZM
                    </div>
                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,16,16,0.9)] animate-pulse" />
                </div>
                <div className="flex-1 leading-tight">
                    <p className="text-xs uppercase tracking-[0.15em] text-neutral-500">AI Concierge</p>
                    <p className="text-sm text-neutral-200 font-semibold">Zen Master is standing by</p>
                </div>
                <button
                    onClick={() => setOpen(!open)}
                    className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded-md bg-neutral-800/80 border border-neutral-700"
                >
                    {open ? 'Hide' : 'Show'}
                </button>
            </div>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="bg-neutral-900/80 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden"
                    >
                        <div className="px-4 pt-4 pb-3 border-b border-neutral-800">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-sm font-semibold text-white">Proactive suggestions</p>
                                <button
                                    onClick={reset}
                                    className="text-[10px] uppercase tracking-[0.12em] text-indigo-300 hover:text-white bg-indigo-500/10 border border-indigo-500/30 rounded-full px-3 py-1"
                                >
                                    Refresh
                                </button>
                            </div>
                            <p className="text-xs text-neutral-500">Tailored clean-up prompts from your Zen Master.</p>
                        </div>

                        <div className="divide-y divide-neutral-800">
                            {nextSuggestion ? (
                                <motion.div
                                    key={nextSuggestion.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="p-4 space-y-3"
                                >
                                    <div className="flex items-start gap-3">
                                        <span className={`px-2 py-1 text-[11px] font-semibold rounded-full ring-1 ${typeColors[nextSuggestion.type]}`}>
                                            {nextSuggestion.type === 'insight' && 'Insight'}
                                            {nextSuggestion.type === 'sorting' && 'Smart Sorting'}
                                            {nextSuggestion.type === 'safety' && 'Safety'}
                                        </span>
                                        <div>
                                            <p className="text-sm text-white font-semibold leading-snug">{nextSuggestion.title}</p>
                                            <p className="text-sm text-neutral-300 leading-snug mt-1">{nextSuggestion.detail}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => markResolved(nextSuggestion.id)}
                                            className="flex-1 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/20"
                                        >
                                            {nextSuggestion.actionLabel}
                                        </button>
                                        {nextSuggestion.secondaryAction && (
                                            <button
                                                onClick={() => markResolved(nextSuggestion.id)}
                                                className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-sm border border-neutral-700"
                                            >
                                                {nextSuggestion.secondaryAction}
                                            </button>
                                        )}
                                    </div>
                                </motion.div>
                            ) : (
                                <div className="p-4 text-sm text-neutral-300">
                                    <p className="font-semibold text-emerald-300">All clear!</p>
                                    <p className="text-neutral-400 mt-1">No pending actions. Zen Master will alert you when something new appears.</p>
                                </div>
                            )}

                            <div className="p-4 space-y-2 bg-neutral-950/60">
                                <p className="text-[11px] uppercase tracking-[0.15em] text-neutral-500">Notification stream</p>
                                <div className="space-y-2 max-h-36 overflow-auto pr-1">
                                    {SUGGESTIONS.map((item) => {
                                        const isDone = resolved.includes(item.id);
                                        return (
                                            <div
                                                key={item.id}
                                                className="flex items-start gap-2 p-2 rounded-xl bg-neutral-900 border border-neutral-800"
                                            >
                                                <span className={`mt-0.5 w-2 h-2 rounded-full ${isDone ? 'bg-neutral-600' : 'bg-emerald-400 animate-pulse'}`} />
                                                <div className="flex-1">
                                                    <p className="text-xs font-semibold text-white leading-tight">{item.title}</p>
                                                    <p className="text-[11px] text-neutral-400 mt-1 leading-snug">{item.detail}</p>
                                                </div>
                                                {isDone ? (
                                                    <span className="text-[10px] px-2 py-1 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700">Logged</span>
                                                ) : (
                                                    <button
                                                        onClick={() => markResolved(item.id)}
                                                        className="text-[10px] px-2 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-indigo-200 border border-neutral-700"
                                                    >
                                                        Dismiss
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

export default AIConcierge;
