import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

export function ZenScanner() {
  return (
    <div className="relative w-72 h-72 flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-nebula-blue/20 via-transparent to-nebula-purple/25 blur-3xl" />

      <div className="absolute inset-2 rounded-full border border-white/10" />
      <div className="absolute inset-4 rounded-full border border-white/10" />
      <motion.div
        className="absolute inset-6 rounded-full border-2 border-nebula-blue/40"
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        style={{ borderRightColor: 'transparent', borderLeftColor: 'transparent' }}
      />
      <motion.div
        className="absolute inset-10 rounded-full border border-nebula-purple/40"
        animate={{ rotate: -360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        style={{ borderTopColor: 'transparent', borderBottomColor: 'transparent' }}
      />

      <div className="absolute w-6 h-6 rounded-full bg-nebula-teal/60 blur-lg animate-ping" />
      <div className="absolute w-44 h-44 rounded-full bg-nebula-blue/10 blur-3xl" />

      <motion.div
        className="relative w-28 h-28 rounded-full bg-void-light border border-white/10 flex items-center justify-center shadow-[0_0_60px_rgba(79,140,255,0.45)]"
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Sparkles className="w-8 h-8 text-nebula-teal" />
        <div className="absolute inset-2 rounded-full border border-nebula-teal/30" />
      </motion.div>

      <div className="absolute -bottom-10 text-center text-xs uppercase tracking-[0.3em] text-white/60">
        Zen Scanner
      </div>
    </div>
  )
}

export default ZenScanner
