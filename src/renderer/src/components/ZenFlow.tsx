import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { DuplicateCluster, FileNode } from '../../../shared/types'
import { useScanStore } from '../store/useScanStore'

interface ZenFlowProps {
  duplicateClusters: DuplicateCluster[]
  largeFiles: FileNode[]
}

type FlowCard = {
  id: string
  file: FileNode
  context: 'duplicate' | 'large'
  indexLabel: string
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function ZenFlow({ duplicateClusters, largeFiles }: ZenFlowProps) {
  const { actionTrash, actionQuarantine } = useScanStore()
  const [stack, setStack] = useState<FlowCard[]>([])
  const [recentAction, setRecentAction] = useState<string>('')
  const [burst, setBurst] = useState<{ color: string; label: string } | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const playTone = (frequency: number) => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext()
      }
      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = frequency
      gain.gain.value = 0.1
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
      osc.stop(ctx.currentTime + 0.25)
    } catch (err) {
      console.warn('Tone playback skipped', err)
    }
  }

  const cardsFromData = useMemo<FlowCard[]>(() => {
    const duplicateCards = duplicateClusters.flatMap((cluster, clusterIndex) =>
      cluster.files.slice(1).map((file, fileIndex) => ({
        id: `${cluster.hash}-${file.id}`,
        file,
        context: 'duplicate' as const,
        indexLabel: `Dup ${clusterIndex + 1}.${fileIndex + 1}`
      }))
    )

    const largeCards = largeFiles.map((file, index) => ({
      id: `large-${file.id}`,
      file,
      context: 'large' as const,
      indexLabel: `Large ${index + 1}`
    }))

    return [...duplicateCards, ...largeCards]
  }, [duplicateClusters, largeFiles])

  useEffect(() => {
    setStack(cardsFromData)
  }, [cardsFromData])

  const handleDecision = async (direction: 'left' | 'right' | 'up', card: FlowCard) => {
    setStack(prev => prev.filter(item => item.id !== card.id))

    if (direction === 'left') {
      await actionTrash([card.file.id])
      setRecentAction(`Deleted ${card.file.name}`)
      setBurst({ color: 'bg-red-500/40', label: 'Delete' })
      playTone(200)
    } else if (direction === 'up') {
      await actionQuarantine([card.file.id])
      setRecentAction(`Archived ${card.file.name}`)
      setBurst({ color: 'bg-amber-400/40', label: 'Archive' })
      playTone(320)
    } else {
      setRecentAction(`Kept ${card.file.name}`)
      setBurst({ color: 'bg-emerald-400/40', label: 'Keep' })
      playTone(440)
    }

    setTimeout(() => setBurst(null), 400)
  }

  const renderCard = (card: FlowCard, index: number) => {
    const isTop = index === 0
    const offset = Math.min(index, 2)

    return (
      <motion.div
        key={card.id}
        drag={isTop ? true : false}
        dragConstraints={{ left: 0, right: 0, top: -200, bottom: 200 }}
        dragElastic={0.6}
        onDragEnd={(_, info) => {
          if (!isTop) return
          const { offset, velocity } = info
          const speed = Math.abs(velocity.x)
          if (offset.x > 120 || (velocity.x > 800 && speed > 800)) {
            handleDecision('right', card)
          } else if (offset.x < -120 || (velocity.x < -800 && speed > 800)) {
            handleDecision('left', card)
          } else if (info.offset.y < -120) {
            handleDecision('up', card)
          }
        }}
        className="absolute inset-0"
        style={{
          zIndex: stack.length - index,
          transformOrigin: 'center',
          transform: `translateY(${offset * 10}px) scale(${1 - offset * 0.04})`
        }}
        initial={{ opacity: 0, scale: 0.95, y: 30 }}
        animate={{ opacity: 1, scale: 1 - offset * 0.04, y: offset * 10 }}
        exit={{ opacity: 0, scale: 0.9, y: -60 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24 }}
      >
        <div className="relative h-full w-full rounded-2xl border border-neutral-800 bg-gradient-to-br from-neutral-900 via-neutral-900/80 to-neutral-950 shadow-2xl p-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_-10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_80%_10%,rgba(16,185,129,0.18),transparent_35%)]" />

          <div className="relative flex flex-col h-full">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-neutral-500">{card.indexLabel}</p>
                <h3 className="text-2xl font-semibold text-white mt-2">{card.file.name}</h3>
                <p className="text-neutral-400 text-sm truncate max-w-xl">{card.file.path}</p>
              </div>
              <span
                className={`text-xs px-3 py-1 rounded-full border ${
                  card.context === 'duplicate'
                    ? 'border-indigo-500/50 text-indigo-300 bg-indigo-500/10'
                    : 'border-amber-500/50 text-amber-200 bg-amber-500/10'
                }`}
              >
                {card.context === 'duplicate' ? 'Duplicate' : 'Large'}
              </span>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-3">
                <p className="text-xs text-neutral-500">Size</p>
                <p className="text-lg font-mono text-indigo-300">{formatBytes(card.file.sizeBytes)}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-3">
                <p className="text-xs text-neutral-500">Tags</p>
                <p className="text-sm text-neutral-200">{card.file.tags.join(', ') || 'untagged'}</p>
              </div>
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-3">
                <p className="text-xs text-neutral-500">Action Map</p>
                <p className="text-sm text-neutral-200">Left = Delete, Up = Archive, Right = Keep</p>
              </div>
            </div>

            <div className="mt-auto pt-6 flex items-center justify-between text-xs text-neutral-500">
              <p>Swipe to decide. Tap for a tiny zen moment.</p>
              <div className="flex items-center gap-2 text-neutral-300">
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-200 border border-red-500/30">← Delete</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400/10 text-amber-100 border border-amber-400/30">↑ Archive</span>
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-100 border border-emerald-400/30">→ Keep</span>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className="relative h-[520px] w-full flex items-center justify-center">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.08),transparent_45%)] pointer-events-none" />

      <div className="absolute left-6 top-6 text-xs text-neutral-400 space-y-1">
        <p className="text-sm font-semibold text-white">Zen Flow</p>
        <p className="text-neutral-500">A focused stack to keep, delete, or archive fast.</p>
        <div className="flex gap-2 text-neutral-300">
          <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">{duplicateClusters.length} duplicate groups</span>
          <span className="px-2 py-1 bg-neutral-800 rounded border border-neutral-700">{largeFiles.length} large files</span>
        </div>
      </div>

      <div className="absolute right-6 top-6 flex items-center gap-2 text-xs text-neutral-400">
        {burst && (
          <div className={`px-3 py-1 rounded-full border border-neutral-700 ${burst.color} text-white shadow-lg`}>{burst.label}</div>
        )}
        {recentAction && <span className="text-neutral-300">{recentAction}</span>}
      </div>

      <div className="relative h-[420px] w-[720px]">
        <AnimatePresence>
          {stack.length === 0 ? (
            <motion.div
              className="absolute inset-0 flex items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="text-center space-y-2">
                <p className="text-lg text-neutral-200 font-semibold">You cleared the deck ✨</p>
                <p className="text-sm text-neutral-500">Re-run a scan to refill the Zen Flow stack.</p>
              </div>
            </motion.div>
          ) : (
            stack.slice(0, 3).map(renderCard)
          )}
        </AnimatePresence>
      </div>

      <div className="absolute bottom-4 flex items-center gap-3 text-xs text-neutral-400">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full border border-neutral-800 bg-neutral-900/60">
          <span className="text-neutral-200 font-semibold">{stack.length}</span>
          <span>cards remaining</span>
        </div>
        <div className="flex gap-2">
          <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-200 border border-red-500/30">Swipe Left = Delete</span>
          <span className="px-2 py-1 rounded-full bg-amber-400/10 text-amber-100 border border-amber-400/30">Swipe Up = Archive</span>
          <span className="px-2 py-1 rounded-full bg-emerald-400/10 text-emerald-100 border border-emerald-400/30">Swipe Right = Keep</span>
        </div>
      </div>
    </div>
  )
}
