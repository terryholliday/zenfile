import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { useScanStore } from '../store/useScanStore'
import { useState, useEffect } from 'react'

const ZEN_QUOTES = [
  'Order is the sanity of the mind, the health of the body, the peace of the city.',
  'Simplifying your life is about finding the balance between what you need and what you want.',
  'Clutter is nothing more than postponed decisions.',
  'Simplicity is the ultimate sophistication.',
  'For every minute spent organizing, an hour is earned.',
  'The objective of cleaning is not just to clean, but to feel happiness living within that environment.',
  'Clear your space, clear your mind.',
  'Digital minimalism is about focusing on what truly matters.'
];

export function ScanDashboard() {
  const {
    scanState,
    filesScanned,
    bytesScanned,
    settings,
    setIncludePath,
    startScan,
    cancelScan,
    currentFile
  } = useScanStore()

  const [quote, setQuote] = useState(ZEN_QUOTES[0]);
  const isScanning = scanState === 'SCANNING'
  const isIdle = scanState === 'IDLE' || scanState === 'COMPLETED'

  // Rotate quotes during scanning
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setQuote(ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)]);
    }, 5000); // Change every 5 seconds
    return () => clearInterval(interval);
  }, [isScanning]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-8 min-h-[400px] w-full max-w-2xl mx-auto">
      {/* Progress Ring / Status Indicator */}
      <div className="relative w-72 h-72 flex items-center justify-center">
        {/* Background Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-white/5" />

        {/* Animated Ring (Breathing Effect) */}
        <motion.div
          className={clsx(
            'absolute inset-0 rounded-full border-4 border-indigo-400 blur-sm',
            isScanning ? 'opacity-100' : 'opacity-0'
          )}
          animate={isScanning ? {
            rotate: 360,
            scale: [1, 1.05, 1],
          } : { rotate: 0, scale: 1 }}
          transition={{
            rotate: { duration: 8, repeat: Infinity, ease: 'linear' },
            scale: { duration: 4, repeat: Infinity, ease: 'easeInOut' }
          }}
          style={{
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent',
            borderLeftColor: 'transparent'
          }}
        />
        <motion.div
          className={clsx(
            'absolute inset-0 rounded-full border-4 border-white',
            isScanning ? 'opacity-100' : 'opacity-0'
          )}
          animate={isScanning ? { rotate: -360 } : { rotate: 0 }}
          transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
          style={{
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent'
          }}
        />

        {/* Center Content */}
        <div className="text-center z-10 p-8 glass-panel rounded-full w-48 h-48 flex flex-col items-center justify-center backdrop-blur-3xl shadow-2xl border-white/10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={scanState}
            className="flex flex-col items-center"
          >
            <h3 className="text-3xl font-black text-white tracking-tighter drop-shadow-lg">
              {scanState === 'IDLE'
                ? 'READY'
                : scanState === 'SCANNING'
                  ? 'ZEN MDOE'
                  : scanState === 'COMPLETED'
                    ? 'DONE'
                    : scanState}
            </h3>
            <p className="text-indigo-200 text-xs mt-2 uppercase tracking-widest font-bold">
              {scanState === 'SCANNING'
                ? 'Harmonizing Files'
                : 'System Idle'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Zen Quote */}
      {isScanning && (
        <motion.div
          key={quote}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="h-12 text-center max-w-md"
        >
          <p className="text-sm text-indigo-200/80 italic font-medium">&quot;{quote}&quot;</p>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 w-full">
        <div className="p-5 glass-panel rounded-2xl text-center hover:bg-white/10 transition-colors">
          <div className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Files Scanned</div>
          <div className="text-3xl font-mono text-white tracking-tight">{filesScanned.toLocaleString()}</div>
        </div>
        <div className="p-5 glass-panel rounded-2xl text-center hover:bg-white/10 transition-colors">
          <div className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Data Processed</div>
          <div className="text-3xl font-mono text-indigo-300 tracking-tight">{formatBytes(bytesScanned)}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-6 w-full">
        {isIdle && (
          <div className="flex items-center gap-4 w-full p-2 pl-4 pr-2 rounded-xl glass-panel group hover:border-white/20 transition-all">
            <div className="flex-1 truncate text-left">
              <div className="text-[10px] text-neutral-500 uppercase tracking-wider font-bold mb-0.5">
                Target Directory
              </div>
              <div
                className="text-neutral-200 text-sm truncate font-mono group-hover:text-white transition-colors"
                title={settings?.includePaths[0]}
              >
                {settings?.includePaths[0] || 'No directory selected'}
              </div>
            </div>
            <button
              onClick={async () => {
                const path = await window.fileZen.openDirectory()
                if (path) setIncludePath(path)
              }}
              className="px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/5 hover:border-white/20 transition-all"
            >
              CHANGE
            </button>
          </div>
        )}

        <div className="w-full">
          {isIdle ? (
            <button
              onClick={() => startScan(settings?.includePaths || [])}
              className="w-full py-4 bg-white text-black hover:bg-indigo-50 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98]"
            >
              Start Zen Scan
            </button>
          ) : (
            <button
              onClick={() => cancelScan()}
              className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl font-bold text-lg transition-all active:scale-[0.98]"
              disabled={scanState === 'CANCELLING'}
            >
              {scanState === 'CANCELLING' ? 'Stopping...' : 'Stop Scan'}
            </button>
          )}
        </div>

        {/* Live Scan Results (Subtle in Zen Mode) */}
        {isScanning && currentFile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            className="w-full text-center"
          >
            <div className="text-neutral-500 font-mono text-[10px] truncate max-w-xs mx-auto" title={currentFile}>
              {currentFile}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
