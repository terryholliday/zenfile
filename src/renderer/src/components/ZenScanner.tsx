import { useEffect, useState } from 'react'
import { useScanStore } from '../store/useScanStore'

type VisualState = 'idle' | 'scanning' | 'complete'

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, exponent)
  return `${value.toFixed(1)} ${units[exponent]}`
}

export function ZenScanner(): JSX.Element {
  const scanState = useScanStore((state) => state.scanState)
  const filesScanned = useScanStore((state) => state.filesScanned)
  const bytesScanned = useScanStore((state) => state.bytesScanned)

  const status: VisualState =
    scanState === 'SCANNING' || scanState === 'PAUSED'
      ? 'scanning'
      : scanState === 'COMPLETED'
        ? 'complete'
        : 'idle'

  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined

    if (status === 'scanning') {
      interval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 0.6, 96))
      }, 50)
    } else if (status === 'complete') {
      timeout = setTimeout(() => setProgress(100), 0)
    } else {
      timeout = setTimeout(() => setProgress(0), 0)
    }

    return () => {
      if (interval) clearInterval(interval)
      if (timeout) clearTimeout(timeout)
    }
  }, [status])

  const getGlowColor = (): string => {
    if (status === 'scanning') return 'shadow-[0_0_50px_rgba(157,79,255,0.6)] border-nebula-purple'
    if (status === 'complete') return 'shadow-[0_0_50px_rgba(42,245,230,0.6)] border-nebula-teal'
    return 'shadow-[0_0_30px_rgba(79,140,255,0.4)] border-nebula-blue'
  }

  const getTextColor = (): string => {
    if (status === 'scanning') return 'text-nebula-purple'
    if (status === 'complete') return 'text-nebula-teal'
    return 'text-nebula-blue'
  }

  const statusLabel = {
    idle: 'READY',
    scanning: 'ZEN MODE',
    complete: 'COMPLETE'
  }[status]

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      {/* Background Ambient Glow (Deep Space) */}
      <div
        className={`absolute w-96 h-96 bg-nebula-blue/10 rounded-full blur-3xl animate-pulse transition-all duration-1000 ${status === 'scanning' ? 'bg-nebula-purple/20' : ''}`}
      />

      {/* The Zen Circle Container */}
      <div className="relative">
        {/* Ripple Ring 1 (Slow Expansion) */}
        <div
          className={`absolute inset-0 rounded-full border border-white/5 ${status === 'scanning' ? 'animate-[ping_3s_linear_infinite]' : ''}`}
        />

        {/* Ripple Ring 2 (Delayed) */}
        <div
          className={`absolute inset-[-10px] rounded-full border border-white/5 ${status === 'scanning' ? 'animate-[ping_3s_linear_infinite_1s]' : ''}`}
        />

        {/* MAIN INTERFACE CIRCLE */}
        <div
          className={`
          relative w-64 h-64 rounded-full 
          bg-void-light/50 backdrop-blur-md 
          border-2 transition-all duration-700 ease-out
          flex flex-col items-center justify-center
          ${getGlowColor()}
          ${status === 'scanning' ? 'scale-105' : 'hover:scale-105'}
        `}
        >
          {/* Progress Ring (SVG Overlay) */}
          <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
            <circle
              cx="128"
              cy="128"
              r="124"
              stroke="currentColor"
              strokeWidth="2"
              fill="transparent"
              className="text-void-light"
            />
            <circle
              cx="128"
              cy="128"
              r="124"
              stroke="currentColor"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={779} // 2 * PI * r
              strokeDashoffset={779 - (779 * progress) / 100}
              className={`transition-all duration-300 ${getTextColor()}`}
              strokeLinecap="round"
            />
          </svg>

          {/* Inner Content */}
          <div className="relative z-10 flex flex-col items-center">
            <div className={`text-xs font-bold tracking-[0.3em] uppercase ${getTextColor()}`}>
              {statusLabel}
            </div>
            <div className="text-5xl font-black text-white drop-shadow-lg">
              {Math.round(progress)}%
            </div>
            <div className="text-[10px] text-neutral-300 mt-2 tracking-widest uppercase">
              {status === 'scanning'
                ? 'Calibrating'
                : status === 'complete'
                  ? 'Scan Finished'
                  : 'Awaiting Command'}
            </div>
            <div className="mt-3 text-xs text-neutral-400 text-center">
              <div className="font-mono text-sm text-white">
                {filesScanned.toLocaleString()} files
              </div>
              <div className="text-[11px]">{formatBytes(bytesScanned)} processed</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZenScanner
