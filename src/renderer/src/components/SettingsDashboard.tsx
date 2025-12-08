import { useScanStore } from '../store/useScanStore';
import { clsx } from 'clsx';
import { useState } from 'react';
import { motion } from 'framer-motion';

export function SettingsDashboard() {
    const { settings, updateSettings } = useScanStore();
    const [newExclude, setNewExclude] = useState("");

    if (!settings) return null;

    const handleAddExclude = () => {
        if (!newExclude) return;
        updateSettings({
            excludePaths: [...settings.excludePaths, newExclude]
        });
        setNewExclude("");
    };

    const handleRemoveExclude = (pathToRemove: string) => {
        updateSettings({
            excludePaths: settings.excludePaths.filter(p => p !== pathToRemove)
        });
    };

    return (
        <div className="max-w-5xl mx-auto p-8 space-y-8">
            <header className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-neutral-400">Control Room</p>
                <h2 className="text-4xl font-bold text-white drop-shadow-[0_8px_28px_rgba(99,102,241,0.35)]">Settings</h2>
                <p className="text-neutral-300 mt-1">Configure scanning rules and safety limits.</p>
            </header>

            {/* Scan Criteria */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-indigo-200 uppercase tracking-[0.2em] text-xs">Scan Criteria</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {[{
                        title: 'Large File Threshold (MB)',
                        helper: 'Files larger than this will be flagged.',
                        value: settings.maxFileMb,
                        onChange: (val: number) => updateSettings({ maxFileMb: val }),
                        accent: 'from-indigo-500/20 via-blue-500/10 to-cyan-400/10'
                    }, {
                        title: 'Stale File Threshold (Years)',
                        helper: 'Files explicitly older than this will be flagged.',
                        value: settings.staleYears,
                        onChange: (val: number) => updateSettings({ staleYears: val }),
                        accent: 'from-emerald-500/25 via-cyan-500/15 to-blue-500/10'
                    }].map((card) => (
                        <motion.div
                            key={card.title}
                            whileHover={{ scale: 1.01 }}
                            className="relative overflow-hidden bg-white/5 p-6 rounded-xl border border-white/10 backdrop-blur-xl shadow-[0_25px_60px_-35px_rgba(0,0,0,0.7)]"
                        >
                            <div className={clsx("absolute inset-0 blur-3xl", `bg-gradient-to-br ${card.accent}`)} />
                            <div className="relative">
                                <label className="block text-sm font-medium text-neutral-100 mb-2">
                                    {card.title}
                                </label>
                                <p className="text-xs text-neutral-200/70 mb-4">{card.helper}</p>
                                <input
                                    type="number"
                                    value={card.value}
                                    onChange={(e) => card.onChange(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-400 outline-none transition-all shadow-inner shadow-black/20"
                                />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Safety */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-emerald-200 uppercase tracking-[0.2em] text-xs">Safety</h3>

                <motion.div
                    whileHover={{ scale: 1.005 }}
                    className="bg-white/5 p-6 rounded-xl border border-white/10 flex items-center justify-between backdrop-blur-xl shadow-[0_25px_60px_-40px_rgba(0,0,0,0.75)]"
                >
                    <div>
                        <label className="block text-base font-medium text-white mb-1">
                            Dry Run Mode
                        </label>
                        <p className="text-sm text-neutral-200/80">
                            Perform actions (Trash/Quarantine) without actually modifying files.
                        </p>
                    </div>
                    <button
                        onClick={() => updateSettings({ dryRun: !settings.dryRun })}
                        className={clsx(
                            "relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-neutral-900",
                            settings.dryRun ? 'bg-gradient-to-r from-indigo-500 to-blue-500 shadow-[0_10px_30px_-18px_rgba(99,102,241,0.9)]' : 'bg-white/10'
                        )}
                    >
                        <span
                            className={clsx(
                                "inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform",
                                settings.dryRun ? 'translate-x-5' : 'translate-x-1'
                            )}
                        />
                    </button>
                </motion.div>
            </section>

            {/* Excluded Paths */}
            <section className="space-y-4">
                <h3 className="text-lg font-semibold text-rose-200 uppercase tracking-[0.2em] text-xs">Excluded Paths</h3>
                <motion.div
                    whileHover={{ scale: 1.005 }}
                    className="bg-white/5 p-6 rounded-xl border border-white/10 space-y-4 backdrop-blur-xl shadow-[0_25px_60px_-35px_rgba(0,0,0,0.75)]"
                >
                    <p className="text-sm text-neutral-200/80">These folders will be completely ignored during scans.</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="e.g., node_modules, .git"
                            value={newExclude}
                            onChange={(e) => setNewExclude(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleAddExclude()}
                            className="flex-1 bg-white/5 border border-white/15 rounded px-3 py-2 text-white focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
                        />
                        <motion.button
                            onClick={handleAddExclude}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="px-4 py-2 bg-gradient-to-r from-indigo-500/70 to-blue-500/70 text-white rounded-lg border border-white/10 shadow-[0_15px_40px_-25px_rgba(59,130,246,0.9)]"
                        >
                            Add
                        </motion.button>
                    </div>

                    <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {settings.excludePaths.map((path) => (
                            <motion.li
                                key={path}
                                initial={{ opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex items-center justify-between bg-white/5 px-3 py-2 rounded-lg border border-white/10 group backdrop-blur"
                            >
                                <span className="text-sm text-neutral-100 font-mono">{path}</span>
                                <button
                                    onClick={() => handleRemoveExclude(path)}
                                    className="text-neutral-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    Remove
                                </button>
                            </motion.li>
                        ))}
                        {settings.excludePaths.length === 0 && (
                            <li className="text-sm text-neutral-400 italic">No exclusions set.</li>
                        )}
                    </ul>
                </motion.div>
            </section>
        </div>
    );
}
