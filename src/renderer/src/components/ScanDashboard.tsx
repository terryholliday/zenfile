import { motion } from 'framer-motion'
import { clsx } from 'clsx'
import { useScanStore } from '../store/useScanStore'

export function ScanDashboard() {
  const {
    scanState,
    filesScanned,
    bytesScanned,
    settings,
    setIncludePath,
    startScan,
    cancelScan,
    currentFile,
    recentFiles
  } = useScanStore()

  const currentFileName = currentFile?.split(/[/\\]/).pop()

  const isScanning = scanState === 'SCANNING'
  const isIdle = scanState === 'IDLE' || scanState === 'COMPLETED'

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 space-y-8 min-h-[400px]">
      {/* Progress Ring / Status Indicator */}
      <div className="relative w-64 h-64 flex items-center justify-center">
        {/* Background Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-neutral-800" />

        {/* Animated Ring */}
        <motion.div
          className={clsx(
            'absolute inset-0 rounded-full border-4 border-indigo-500',
            isScanning ? 'opacity-100' : 'opacity-0'
          )}
          animate={isScanning ? { rotate: 360 } : { rotate: 0 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          style={{
            borderRightColor: 'transparent',
            borderBottomColor: 'transparent'
          }}
        />

        {/* Center Content */}
        <div className="text-center z-10">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            key={scanState}
            className="flex flex-col items-center"
          >
            <h3 className="text-4xl font-bold text-white tracking-tighter">
              {scanState === 'IDLE'
                ? 'Ready'
                : scanState === 'SCANNING'
                  ? 'Scanning'
                  : scanState === 'COMPLETED'
                    ? 'Done'
                    : scanState}
            </h3>
            <p className="text-neutral-500 text-sm mt-2">
              {scanState === 'SCANNING'
                ? `${formatBytes(bytesScanned)} processed`
                : 'Waiting for command'}
            </p>
          </motion.div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700 text-center">
          <div className="text-sm text-neutral-400">Files Scanned</div>
          <div className="text-xl font-mono text-indigo-400">{filesScanned.toLocaleString()}</div>
        </div>
        <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700 text-center">
          <div className="text-sm text-neutral-400">Data Processed</div>
          <div className="text-xl font-mono text-emerald-400">{formatBytes(bytesScanned)}</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-4 w-full">
        {isIdle && (
          <div className="flex items-center gap-4 w-full max-w-md p-3 rounded-lg bg-neutral-800 border border-neutral-700">
            <div className="flex-1 truncate text-left">
              <div className="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-1">
                Target Directory
              </div>
              <div
                className="text-neutral-200 text-sm truncate font-mono"
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
              className="px-4 py-2 text-sm bg-neutral-700 hover:bg-neutral-600 text-white rounded transition-colors"
            >
              Change
            </button>
          </div>
        )}

        <div className="flex gap-4">
          {isIdle ? (
            <button
              onClick={() => startScan(settings?.includePaths || [])}
              className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20 w-48"
            >
              Start Smart Scan
            </button>
          ) : (
            <button
              onClick={() => cancelScan()}
              className="px-8 py-3 bg-red-900/50 hover:bg-red-900 border border-red-800 text-red-200 rounded-lg font-medium transition-colors w-48"
              disabled={scanState === 'CANCELLING'}
            >
              {scanState === 'CANCELLING' ? 'Stopping...' : 'Stop Scan'}
            </button>
          )}
        </div>

        {/* Live Scan Results */}
        {isScanning && currentFile && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-xl mt-4 px-4 py-3 bg-neutral-900/50 rounded-md border border-neutral-800"
          >
            <div className="flex items-center gap-2 text-xs text-neutral-500 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="uppercase tracking-wider font-bold">Processing</span>
            </div>
            <div className="text-neutral-100 font-semibold break-all">{currentFileName}</div>
            <div className="text-neutral-400 font-mono text-xs break-all" title={currentFile}>
              {currentFile}
            </div>
          </motion.div>
        )}

        {isScanning && recentFiles.length > 0 && (
          <div className="w-full max-w-xl mt-2 p-4 bg-neutral-900/30 rounded-md border border-neutral-800">
            <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
              <span className="uppercase tracking-wider font-bold">Recently queued</span>
              <span>{Math.min(recentFiles.length, 50)} files</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
              {recentFiles.map((file, idx) => (
                <div
                  key={`${file}-${idx}`}
                  className="flex items-start gap-2 text-xs text-neutral-300"
                >
                  <div className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                  <div className="flex flex-col">
                    <span className="font-semibold text-neutral-100 break-all">
                      {file.split(/[/\\]/).pop()}
                    </span>
                    <span className="text-neutral-500 break-all font-mono">{file}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
