import { FileText, Film, Image, LucideIcon, ShieldCheck, File } from 'lucide-react'

export type NebulaFileType = 'img' | 'doc' | 'sys' | 'vid' | 'pdf'
export type NebulaFileSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeMap: Record<NebulaFileSize, string> = {
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-14 h-14',
  xl: 'w-16 h-16'
}

const iconMap: Record<NebulaFileType, { Icon: LucideIcon; gradient: string; label: string }> = {
  img: { Icon: Image, gradient: 'from-blue-400 to-cyan-300', label: 'IMG' },
  doc: { Icon: FileText, gradient: 'from-emerald-400 to-green-300', label: 'DOC' },
  sys: { Icon: ShieldCheck, gradient: 'from-orange-400 to-amber-300', label: 'SYS' },
  vid: { Icon: Film, gradient: 'from-fuchsia-400 to-purple-400', label: 'VID' },
  pdf: { Icon: File, gradient: 'from-rose-400 to-red-300', label: 'PDF' }
}

interface NebulaFileNodeProps {
  size?: NebulaFileSize
  type?: NebulaFileType
}

const NebulaFileNode = ({ size = 'md', type = 'doc' }: NebulaFileNodeProps): JSX.Element => {
  const { Icon, gradient, label } = iconMap[type]

  return (
    <div
      className={`relative ${sizeMap[size]} rounded-2xl bg-gradient-to-br ${gradient} shadow-lg shadow-black/40 border border-white/10 flex items-center justify-center`}
    >
      <div className="absolute inset-1 rounded-xl bg-black/30 backdrop-blur-sm border border-white/10" />
      <div className="relative flex flex-col items-center justify-center text-white">
        <Icon className="w-5 h-5 drop-shadow" />
        <span className="text-[10px] font-semibold tracking-tight text-white/80 mt-1">{label}</span>
      </div>
    </div>
  )
}

export default NebulaFileNode
