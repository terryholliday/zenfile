import { useState, useEffect } from 'react'
import { twMerge } from 'tailwind-merge'
import { ScanDashboard } from './components/ScanDashboard'
import { ResultsDashboard } from './components/ResultsDashboard'
import { SettingsDashboard } from './components/SettingsDashboard'
import ZenDashboard from './components/ZenDashboard'
import { useScanStore } from './store/useScanStore'

type Tab = 'scan' | 'results' | 'settings' | 'zen'

const tabs: Tab[] = ['scan', 'results', 'settings', 'zen']

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('scan')
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
    <div className="flex flex-col h-screen font-sans select-none overflow-hidden text-neutral-100">
      {/* Title Bar / Header */}
      <header className="flex items-center justify-between px-6 py-4 glass-header drag-region z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30 flex items-center justify-center">
            <div className="w-3 h-3 bg-white rounded-full opacity-90" />
          </div>
          <h1 className="text-lg font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">FileZen</h1>
        </div>

        {/* Status Indicator */}
        <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-xs font-medium text-neutral-400">
          {scanState === 'IDLE' ? 'Ready' : scanState}
        </div>
      </header>

      {/* Tabs */}
      <div className="px-6 pt-4 pb-2 z-40">
        <nav className="flex p-1 gap-1 glass-panel rounded-xl no-drag max-w-md">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={twMerge(
                "flex-1 py-1.5 px-3 rounded-lg text-sm font-medium transition-all duration-200",
                activeTab === tab
                  ? "bg-white/10 text-white shadow-sm"
                  : "text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              )}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative mx-6 mb-6 mt-2 rounded-2xl glass-panel border-white/5 shadow-2xl">
        <div className="absolute inset-0 p-0 overflow-auto scrollbar-hide">
          {activeTab === 'scan' && (
            <div className="h-full flex items-center justify-center">
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

          {activeTab === 'zen' && (
            <div className="h-full">
              <ZenDashboard />
            </div>
          )}
        </div>
      </main>

      {/* Status Bar */}
      <footer className="px-6 py-2 text-[10px] text-neutral-500 flex justify-between">
        <span>v1.0.0-alpha</span>
        <span>Made with 💜 by Antigravity</span>
      </footer>
    </div>
  )
}

export default App
