import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { twMerge } from 'tailwind-merge'
import { ScanDashboard } from './components/ScanDashboard'
import { ResultsDashboard } from './components/ResultsDashboard'
import { SettingsDashboard } from './components/SettingsDashboard'
import { useScanStore } from './store/useScanStore'

function App() {
  const [activeTab, setActiveTab] = useState<'scan' | 'results' | 'settings'>('scan')
  const scanState = useScanStore(s => s.scanState);
  const initialize = useScanStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  // Auto-switch to results when done
  useEffect(() => {
    if (scanState === 'COMPLETED') {
      setActiveTab('results');
    }
  }, [scanState]);

  const tabItems: Array<{ key: 'scan' | 'results' | 'settings'; label: string; accent: string }> = [
    { key: 'scan', label: 'Scan', accent: 'from-indigo-400/60 via-purple-500/40 to-blue-400/50' },
    { key: 'results', label: 'Results', accent: 'from-emerald-400/60 via-cyan-400/50 to-blue-500/40' },
    { key: 'settings', label: 'Settings', accent: 'from-amber-400/60 via-rose-400/50 to-indigo-400/40' }
  ]

  return (
    <div className="relative flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans select-none overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -left-32 top-10 h-64 w-64 bg-indigo-500/30 blur-[120px]" />
        <div className="absolute right-0 top-32 h-72 w-72 bg-emerald-400/20 blur-[120px]" />
        <div className="absolute -bottom-10 left-24 h-80 w-80 bg-purple-500/20 blur-[140px]" />
      </div>

      <div className="relative flex flex-col h-full">
        {/* Title Bar / Header */}
        <header className="flex items-center justify-between px-5 py-4 bg-white/5 backdrop-blur-xl border-b border-white/10 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.5)] drag-region">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 blur-lg bg-indigo-400/50" />
              <div className="relative w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 via-purple-400 to-blue-400 shadow-[0_0_20px_rgba(99,102,241,0.6)]" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs uppercase tracking-[0.2em] text-neutral-400">FileZen</span>
              <span className="text-sm text-white/80">Glassmorphic Edition</span>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex items-center px-5 pt-4 gap-3 no-drag">
          <div className="flex rounded-full bg-white/5 backdrop-blur-lg border border-white/10 p-1 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)]">
            {tabItems.map((tab) => (
              <motion.button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className={twMerge(
                  'relative px-4 py-2 text-sm font-medium rounded-full transition-colors overflow-hidden',
                  activeTab === tab.key ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
                )}
              >
                {activeTab === tab.key && (
                  <motion.span
                    layoutId="tab-pill"
                    className="absolute inset-0 rounded-full bg-gradient-to-r blur-[1px]"
                    transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  />
                )}
                {activeTab === tab.key && (
                  <motion.span
                    layoutId="tab-pill-inner"
                    className={twMerge(
                      'absolute inset-[2px] rounded-full bg-gradient-to-r opacity-90',
                      tab.accent
                    )}
                    transition={{ type: 'spring', stiffness: 220, damping: 22 }}
                  />
                )}
                <span className="relative z-10">{tab.label}</span>
              </motion.button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 overflow-hidden relative">
          <div className="absolute inset-0 p-0 overflow-auto">
            <AnimatePresence mode="wait">
              {activeTab === 'scan' && (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="p-6"
                >
                  <ScanDashboard />
                </motion.div>
              )}

              {activeTab === 'results' && (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="pt-4"
                >
                  <ResultsDashboard />
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="h-full overflow-auto"
                >
                  <SettingsDashboard />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Status Bar */}
        <footer className="px-5 py-2 text-xs text-neutral-400 bg-white/5 backdrop-blur-xl border-t border-white/10 flex justify-between shadow-[0_-10px_30px_-20px_rgba(0,0,0,0.7)]">
          <span>v1.0.0-alpha</span>
          <span className="text-neutral-300">Phase 4: Safety & Optimization</span>
        </footer>
      </div>
    </div>
  )
}

export default App
