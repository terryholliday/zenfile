import { useState, useEffect } from 'react'
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

  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-100 font-sans select-none overflow-hidden">
      {/* Title Bar / Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-neutral-800 border-b border-neutral-700 drag-region">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-indigo-500" />
          <h1 className="text-sm font-semibold tracking-wide uppercase text-neutral-400">FileZen</h1>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex items-center px-4 pt-4 gap-4 no-drag">
        {['scan', 'results', 'settings'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={twMerge(
              "pb-2 text-sm font-medium transition-colors border-b-2",
              activeTab === tab
                ? "border-indigo-500 text-white"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <div className="absolute inset-0 p-0 overflow-auto">
          {/* Removed p-6 to allow full width for results, specific components handle padding */}

          {activeTab === 'scan' && (
            <div className="p-6">
              <ScanDashboard />
            </div>
          )}

          {activeTab === 'results' && (
            <ResultsDashboard />
          )}

          {activeTab === 'settings' && (
            <div className="h-full overflow-auto">
              <SettingsDashboard />
            </div>
          )}
        </div>
      </main>

      {/* Status Bar */}
      <footer className="px-4 py-1 text-xs text-neutral-600 bg-neutral-900 border-t border-neutral-800 flex justify-between">
        <span>v1.0.0-alpha</span>
        <span>Phase 4: Safety & Optimization</span>
      </footer>
    </div>
  )
}

export default App
