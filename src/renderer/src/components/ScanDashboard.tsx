import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useScanStore } from '../store/useScanStore'
import clsx from 'clsx'

const ZEN_QUOTES = [
  'Order is the sanity of the mind, the health of the body, the peace of the city.',
  'Simplifying your life is about finding the balance between what you need and what you want.',
  'Clutter is nothing more than postponed decisions.',
  'Simplicity is the ultimate sophistication.',
  'For every minute spent organizing, an hour is earned.',
  'The objective of cleaning is not just to clean, but to feel happiness living within that environment.',
  'Clear your space, clear your mind.',
  'Digital minimalism is about focusing on what truly matters.'
]

import { ZenGalaxy } from './ZenGalaxy'

// ... existing imports ...

export function ScanDashboard(): JSX.Element {
  const {
    scanState,
    filesScanned,
    bytesScanned,
    currentFile,
    startScan,
    cancelScan,
    settings,
    setIncludePath,
    // Live streaming data
    liveLargeFiles,
    liveFlaggedFiles,
    liveInsight
  } = useScanStore()

  const [quote, setQuote] = useState(ZEN_QUOTES[0])
  const isScanning = scanState === 'SCANNING' || scanState === 'PAUSED'
  const isIdle = scanState === 'IDLE' || scanState === 'COMPLETED' || scanState === 'CANCELLED'

  // Rotate quotes
  useEffect(() => {
    if (!isScanning) return
    const interval = setInterval(() => {
      setQuote(ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)])
    }, 8000)
    return () => clearInterval(interval)
  }, [isScanning])

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="relative flex flex-col items-center min-h-[400px] w-full h-full overflow-y-auto bg-[#050510]">
      {/* 🌌 Premium 3D Background */}
      <div className="absolute inset-0 z-0 opacity-80 pointer-events-none">
        <ZenGalaxy />
      </div>

      {/* Vignette & texture overlay for depth */}
      <div className="absolute inset-0 z-0 bg-radial-gradient-strong pointer-events-none" />

      {/* Main Content */}
      <div className="z-10 flex flex-col items-center space-y-6 w-full max-w-4xl mx-auto p-4 pt-8 pb-16">
        {/* Status Hub */}
        <div className="relative group">
          {/* Animated Glow Behind */}
          <div
            className={clsx(
              'absolute -inset-4 rounded-full blur-2xl transition-all duration-1000',
              isScanning ? 'bg-indigo-500/30 animate-pulse' : 'bg-white/5'
            )}
          />

          <div className="relative w-60 h-60 flex items-center justify-center">
            {/* Outer Rotating Ring */}
            <motion.div
              className={clsx(
                'absolute inset-0 rounded-full border border-indigo-500/30 border-t-indigo-400',
                isScanning && 'shadow-[0_0_30px_rgba(99,102,241,0.3)]'
              )}
              animate={isScanning ? { rotate: 360 } : { rotate: 0 }}
              transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            />

            {/* Inner Counter-Rotating Ring */}
            <motion.div
              className="absolute inset-4 rounded-full border border-white/10 border-b-white/50"
              animate={isScanning ? { rotate: -360 } : { rotate: 0 }}
              transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
            />

            {/* Glass Core */}
            <div className="w-44 h-44 rounded-full glass-panel flex flex-col items-center justify-center backdrop-blur-2xl border border-white/10 shadow-2xl relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />

              <motion.div
                key={scanState}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center z-10"
              >
                <h2 className="text-4xl font-black text-white tracking-tighter drop-shadow-glow">
                  {scanState === 'IDLE'
                    ? 'READY'
                    : scanState === 'SCANNING'
                      ? 'ZEN'
                      : scanState === 'COMPLETED'
                        ? 'DONE'
                        : scanState}
                </h2>
                <p className="text-indigo-200 text-xs font-bold tracking-[0.2em] uppercase mt-2">
                  {scanState === 'SCANNING' ? 'HARMONIZING' : 'AWAITING INPUT'}
                </p>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Stats Grid - Floating Cards */}
        <div className="grid grid-cols-2 gap-6 w-full max-w-lg">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col items-center group hover:bg-white/10 transition-colors">
            <span className="text-xs text-indigo-300 font-bold tracking-wider mb-2 uppercase">
              Files Scanned
            </span>
            <span className="text-3xl font-mono text-white tracking-tight group-hover:scale-110 transition-transform">
              {filesScanned.toLocaleString()}
            </span>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md flex flex-col items-center group hover:bg-white/10 transition-colors">
            <span className="text-xs text-emerald-300 font-bold tracking-wider mb-2 uppercase">
              Data Size
            </span>
            <span className="text-3xl font-mono text-white tracking-tight group-hover:scale-110 transition-transform">
              {formatBytes(bytesScanned)}
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        {isScanning && (
          <div className="w-full max-w-lg space-y-2">
            <div className="flex justify-between text-xs font-mono text-indigo-300/70 uppercase tracking-widest">
              <span>Progress</span>
              <span>{scanState === 'SCANNING' ? 'Processing...' : 'Paused'}</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden backdrop-blur-sm border border-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"
                initial={{ width: '0%' }}
                animate={{
                  width: '100%',
                  transition: {
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                    repeatType: 'loop'
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Dynamic Quote Area */}
        <div className="h-16 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isScanning && (
              <motion.p
                key={quote}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-lg text-indigo-100/80 font-light italic text-center max-w-xl"
              >
                &ldquo;{quote}&rdquo;
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Action Bar */}
        <div className="w-full max-w-lg space-y-4">
          {isScanning && (
            <div className="w-full space-y-3">
              {/* AI Insight Banner */}
              {liveInsight && (
                <div className="w-full p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-md">
                  <p className="text-sm text-indigo-200 font-medium">{liveInsight}</p>
                </div>
              )}

              {/* Current File - FULL PATH */}
              <div className="w-full p-4 rounded-xl bg-black/40 border border-white/5 backdrop-blur-md overflow-hidden relative">
                <div className="absolute top-0 left-0 h-0.5 bg-indigo-500 animate-pulse w-full opacity-50" />
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping mt-1.5 flex-shrink-0" />
                  <span className="text-[10px] font-mono text-indigo-200 break-all opacity-70 leading-relaxed">
                    {currentFile || 'Initializing...'}
                  </span>
                </div>
              </div>

              {/* Live Findings Panel */}
              {(liveLargeFiles.length > 0 || liveFlaggedFiles.length > 0) && (
                <div className="w-full p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md space-y-3">
                  <h3 className="text-xs font-bold text-white/70 uppercase tracking-wider">
                    Live Findings
                  </h3>

                  {/* Large Files */}
                  {liveLargeFiles.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-amber-300 font-medium">
                        📦 Large Files ({liveLargeFiles.length})
                      </p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {liveLargeFiles.slice(0, 3).map((f) => (
                          <div
                            key={f.id}
                            className="flex justify-between text-[10px] text-white/60"
                          >
                            <span className="truncate flex-1 mr-2">{f.name}</span>
                            <span className="text-amber-300/70 flex-shrink-0">
                              {formatBytes(f.sizeBytes)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Flagged Files */}
                  {liveFlaggedFiles.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-300 font-medium">
                        🏷️ Tagged Files ({liveFlaggedFiles.length})
                      </p>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {liveFlaggedFiles.slice(-3).map((f) => (
                          <div
                            key={f.id}
                            className="flex justify-between text-[10px] text-white/60"
                          >
                            <span className="truncate flex-1 mr-2">{f.name}</span>
                            <span className="text-emerald-300/70 flex-shrink-0">
                              {f.tags?.join(', ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4">
            {isIdle ? (
              <>
                <button
                  onClick={async () => {
                    try {
                      console.log('Requesting folder selection...')
                      const path = await window.fileZen.openDirectory()
                      console.log('Selected path:', path)
                      if (path) setIncludePath(path)
                    } catch (error) {
                      console.error('Failed to open directory:', error)
                    }
                  }}
                  className="flex-1 py-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="block text-xs text-neutral-400 font-normal mb-1">
                    SCAN TARGET
                  </span>
                  <span className="block truncate px-4">
                    {settings?.includePaths[0]
                      ? settings.includePaths[0]
                        .split(settings.includePaths[0].includes('\\') ? '\\' : '/')
                        .pop()
                      : 'Select Folder'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    if (settings?.includePaths?.length) startScan(settings.includePaths)
                    else window.fileZen.openDirectory().then((p) => p && setIncludePath(p))
                  }}
                  className="flex-[2] py-4 rounded-xl bg-white text-black font-black text-lg hover:shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                  INITIATE SCAN
                </button>
              </>
            ) : (
              <button
                onClick={() => cancelScan()}
                className="w-full py-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 font-bold hover:bg-red-500/20 transition-all"
              >
                ABORT SEQUENCE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScanDashboard
