import { Sparkles, Radar, Orbit } from 'lucide-react'

const ZenScanner = (): JSX.Element => {
  return (
    <div className="relative w-[360px] h-[360px]">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500/10 via-transparent to-fuchsia-500/10 blur-3xl" />
      <div className="absolute inset-6 rounded-full border border-white/10 bg-black/40 shadow-inner shadow-indigo-500/20" />

      {/* Outer Rings */}
      <div className="absolute inset-2 rounded-full border border-indigo-400/40 animate-pulse" />
      <div className="absolute inset-10 rounded-full border border-fuchsia-400/30 animate-[spin_20s_linear_infinite]" />
      <div className="absolute inset-16 rounded-full border border-white/10" />

      {/* Pulsing Core */}
      <div className="absolute inset-24 rounded-full bg-gradient-to-br from-indigo-500/40 to-purple-500/40 blur-xl animate-pulse" />
      <div className="absolute inset-28 rounded-full border border-white/20 animate-[spin_10s_linear_infinite]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative flex flex-col items-center justify-center gap-4 p-6 rounded-3xl bg-black/40 border border-white/10 shadow-xl">
          <div className="flex items-center gap-3 text-indigo-200 uppercase text-[10px] tracking-[0.3em]">
            <Orbit className="w-4 h-4" />
            <span>Zen Scanner</span>
          </div>
          <div className="relative">
            <div className="w-28 h-28 rounded-full border-2 border-indigo-400/60 animate-[spin_8s_linear_infinite]" />
            <div className="absolute inset-3 rounded-full border border-fuchsia-400/50 animate-[spin_6s_linear_infinite_reverse]" />
            <div className="absolute inset-6 rounded-full border border-white/20 animate-pulse" />
            <div className="absolute inset-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
              <Radar className="w-8 h-8 animate-[spin_12s_linear_infinite]" />
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-100/80">
            <Sparkles className="w-4 h-4 text-amber-200" />
            <span>Listening for cosmic file signals...</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZenScanner
