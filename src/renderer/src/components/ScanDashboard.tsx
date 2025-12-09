import { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useScanStore } from '../store/useScanStore'
import clsx from 'clsx'
import { Canvas } from '@react-three/fiber'
import { Stars, Sparkles, Float } from '@react-three/drei'

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

// --- Galaxy Builder Component ---
function ScanGalaxy({ fileCount }: { fileCount: number }) {
  // Clamp max stars to avoid GPU melting, but allow enough to look cool
  const starCount = Math.min(Math.max(fileCount, 100), 5000);

  // Dynamic color based on count (starts blue, turns gold/white)
  const color = fileCount > 1000 ? '#ffaa00' : '#4f46e5';

  return (
    <group>
      {/* Base Starfield */}
      <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

      {/* Dynamic "Files" as Sparkles */}
      <Sparkles
        count={starCount}
        scale={40}
        size={3}
        speed={0.4}
        opacity={0.8}
        color={color}
      />

      {/* Core Galaxy Glow */}
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.1} />
        </mesh>
      </Float>
    </group>
  )
}

export function ScanDashboard() {
  const {
    scanState,
    filesScanned,
    bytesScanned,
    currentFile,
    duplicates,
    largeFiles,
    startScan,
    cancelScan,
    settings,
    setIncludePath
  } = useScanStore()

  const [quote, setQuote] = useState(ZEN_QUOTES[0]);
  const isScanning = scanState === 'SCANNING' || scanState === 'PAUSED'
  const isIdle = scanState === 'IDLE' || scanState === 'COMPLETED' || scanState === 'CANCELLED'

  // Rotate quotes
  useEffect(() => {
    if (!isScanning) return;
    const interval = setInterval(() => {
      setQuote(ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)]);
    }, 8000); // Slower quote rotation for more zen
    return () => clearInterval(interval);
  }, [isScanning]);

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[400px] w-full h-full overflow-hidden">

      {/* 🌌 Galaxy Builder Background */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
          <color attach="background" args={['#050510']} />
          <fog attach="fog" args={['#050510', 10, 50]} />
          <ambientLight intensity={0.5} />

          <Suspense fallback={null}>
            <ScanGalaxy fileCount={filesScanned} />
          </Suspense>
        </Canvas>
        {/* Vignette Overlay for readability */}
        <div className="absolute inset-0 bg-radial-gradient-strong pointer-events-none" />
      </div>

      {/* Main Content (Z-Index to sit above canvas) */}
      <div className="z-10 flex flex-col items-center justify-center space-y-8 w-full max-w-2xl mx-auto p-4">
        {/* Progress Ring / Status Indicator */}
        <div className="relative w-60 h-60 flex items-center justify-center">
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
          <div className="text-center z-10 p-6 glass-panel rounded-full w-40 h-40 flex flex-col items-center justify-center backdrop-blur-3xl shadow-2xl border-white/10">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              key={scanState}
              className="flex flex-col items-center"
            >
              <h3 className="text-2xl font-black text-white tracking-tighter drop-shadow-lg">
                {scanState === 'IDLE'
                  ? 'READY'
                  : scanState === 'SCANNING'
                    ? 'ZEN MODE'
                    : scanState === 'COMPLETED'
                      ? 'DONE'
                      : scanState}
              </h3>
              <p className="text-indigo-200 text-[10px] mt-1 uppercase tracking-widest font-bold">
                {scanState === 'SCANNING'
                  ? 'Harmonizing'
                  : 'System Idle'}
              </p>
            </motion.div>
          </div>
        </div>

        {/* Zen Quote - Larger and simpler */}
        <AnimatePresence>
          {isScanning && (
            <motion.div
              key={quote}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="h-20 flex items-center justify-center text-center max-w-lg px-4"
            >
              <p className="text-xl md:text-2xl text-indigo-100 font-light leading-relaxed drop-shadow-md">&quot;{quote}&quot;</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 w-full">
          <div className="p-5 glass-panel rounded-2xl text-center hover:bg-white/10 transition-colors backdrop-blur-md">
            <div className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Files Scanned</div>
            <div className="text-3xl font-mono text-white tracking-tight">{filesScanned.toLocaleString()}</div>
          </div>
          <div className="p-5 glass-panel rounded-2xl text-center hover:bg-white/10 transition-colors backdrop-blur-md">
            <div className="text-xs text-neutral-400 uppercase tracking-wider font-bold mb-1">Data Processed</div>
            <div className="text-3xl font-mono text-indigo-300 tracking-tight">{formatBytes(bytesScanned)}</div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-6 w-full">
          {isIdle && (
            <div className="flex items-center gap-4 w-full p-2 pl-4 pr-2 rounded-xl glass-panel group hover:border-white/20 transition-all backdrop-blur-md">
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
                onClick={async () => {
                  const hasPath = settings?.includePaths && settings.includePaths.length > 0
                  if (hasPath) {
                    startScan(settings.includePaths)
                  } else {
                    const path = await window.fileZen.openDirectory()
                    if (path) setIncludePath(path)
                  }
                }}
                className="w-full py-4 bg-white text-black hover:bg-indigo-50 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98]"
              >
                {settings?.includePaths && settings.includePaths.length > 0 ? 'Start Zen Scan' : 'Select Directory to Scan'}
              </button>
            ) : (
              <button
                onClick={() => cancelScan()}
                className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-200 rounded-xl font-bold text-lg transition-all active:scale-[0.98] backdrop-blur-md"
                disabled={scanState === 'CANCELLING'}
              >
                {scanState === 'CANCELLING' ? 'Stopping...' : 'Stop Scan'}
              </button>
            )}
          </div>

          {/* Live Scan Results & Stats */}
          {isScanning && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-xl flex flex-col gap-4"
            >
              {/* Current File - Full Path */}
              <div className="w-full text-center p-3 rounded-xl bg-black/40 border border-white/5 shadow-inner backdrop-blur-sm">
                <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-bold mb-1">Scanning</div>
                <div className="text-indigo-200 font-mono text-xs break-all leading-relaxed">
                  {currentFile}
                </div>
              </div>

              {/* Live Findings Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex flex-col items-center backdrop-blur-sm">
                  <div className="text-2xl font-bold text-red-400">{duplicates.length}</div>
                  <div className="text-[10px] text-red-300/70 uppercase tracking-wider">Duplicate Groups</div>
                </div>
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex flex-col items-center backdrop-blur-sm">
                  <div className="text-2xl font-bold text-amber-400">{largeFiles.length}</div>
                  <div className="text-[10px] text-amber-300/70 uppercase tracking-wider">Large Files</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ScanDashboard
