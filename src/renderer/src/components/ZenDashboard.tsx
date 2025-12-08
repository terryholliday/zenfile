import { useState } from 'react'
import { Search, Shield, Share2, Grid, Layers, Settings, LucideIcon } from 'lucide-react'
import ZenScanner from './ZenScanner'
import NebulaFileNode, { NebulaFileSize, NebulaFileType } from './NebulaFileNode'

interface FloatingFile {
  id: number
  type: NebulaFileType
  size: NebulaFileSize
  top: string
  left: string
}

const floatingFiles: FloatingFile[] = [
  { id: 1, type: 'img', size: 'lg', top: '15%', left: '20%' },
  { id: 2, type: 'doc', size: 'md', top: '25%', left: '80%' },
  { id: 3, type: 'sys', size: 'sm', top: '70%', left: '15%' },
  { id: 4, type: 'vid', size: 'xl', top: '65%', left: '75%' },
  { id: 5, type: 'pdf', size: 'md', top: '10%', left: '50%' }
]

const ZenDashboard = (): JSX.Element => {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div className="flex h-full w-full bg-neutral-900 text-white overflow-hidden font-sans selection:bg-indigo-500 selection:text-white">
      {/* Sidebar */}
      <div className="w-20 h-full border-r border-white/10 bg-neutral-800/30 backdrop-blur-md flex flex-col items-center py-8 z-20">
        <div className="mb-12">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-400 to-purple-500 shadow-[0_0_15px_rgba(79,140,255,0.5)]" />
        </div>
        <div className="space-y-8 flex flex-col">
          <NavIcon icon={Grid} active />
          <NavIcon icon={Layers} />
          <NavIcon icon={Settings} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative flex flex-col">
        {/* Top Bar */}
        <div className="h-20 w-full flex items-center justify-between px-8 z-20">
          <div className="text-sm tracking-widest text-neutral-400 uppercase">My Universe</div>

          <div className="flex items-center gap-3 bg-neutral-800/60 border border-white/10 rounded-full px-6 py-3 w-[500px] hover:border-indigo-400/50 transition-colors duration-300 shadow-lg">
            <Search className="w-4 h-4 text-indigo-400" />
            <input
              type="text"
              placeholder="Ask ZenFile: 'Show me the budget Terry sent last week...'"
              className="bg-transparent border-none outline-none text-sm w-full text-neutral-200 placeholder-neutral-500"
            />
          </div>

          <button
            onClick={() => setIsDragging(!isDragging)}
            className={`text-xs px-4 py-2 rounded border transition-all ${
              isDragging ? 'bg-amber-300 text-black border-amber-300' : 'border-neutral-700 text-neutral-400 hover:text-white'
            }`}
          >
            {isDragging ? 'STOP DRAGGING' : 'SIMULATE DRAG'}
          </button>
        </div>

        {/* Nebula Field */}
        <div className="relative flex-1 flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />

          <div className="z-10 scale-75">
            <ZenScanner />
          </div>

          {floatingFiles.map((file) => (
            <div
              key={file.id}
              className="absolute transition-all duration-[2s] ease-in-out"
              style={{
                top: file.top,
                left: file.left,
                opacity: isDragging ? 0.3 : 1,
                transform: isDragging ? 'scale(0.85)' : 'scale(1)'
              }}
            >
              <NebulaFileNode size={file.size} type={file.type} />
            </div>
          ))}

          <ContextTotem
            side="left"
            isActive={isDragging}
            icon={Shield}
            label="ENCRYPT & VAULT"
            color="border-cyan-300/40 shadow-[inset_10px_0_50px_rgba(34,211,238,0.2)]"
            textColor="text-cyan-200"
          />

          <ContextTotem
            side="right"
            isActive={isDragging}
            icon={Share2}
            label="SHARE EXTERNAL"
            color="border-purple-300/40 shadow-[inset_-10px_0_50px_rgba(168,85,247,0.2)]"
            textColor="text-purple-200"
          />
        </div>
      </div>
    </div>
  )
}

interface NavIconProps {
  icon: LucideIcon
  active?: boolean
}

const NavIcon = ({ icon: Icon, active }: NavIconProps): JSX.Element => (
  <div className={`p-3 rounded-xl cursor-pointer transition-all duration-300 group ${active ? 'bg-white/10' : 'hover:bg-white/5'}`}>
    <Icon className={`w-6 h-6 ${active ? 'text-indigo-400' : 'text-neutral-500 group-hover:text-neutral-200'}`} />
  </div>
)

interface ContextTotemProps {
  side: 'left' | 'right'
  isActive: boolean
  icon: LucideIcon
  label: string
  color: string
  textColor: string
}

const ContextTotem = ({ side, isActive, icon: Icon, label, color, textColor }: ContextTotemProps): JSX.Element => {
  const positionClass = side === 'left' ? 'left-0 border-r' : 'right-0 border-l'
  const translateClass = isActive ? 'translate-x-0 opacity-100' : side === 'left' ? '-translate-x-full opacity-0' : 'translate-x-full opacity-0'

  return (
    <div
      className={`
        absolute top-0 bottom-0 w-48 z-40
        backdrop-blur-xl bg-neutral-900/80
        flex flex-col items-center justify-center
        transition-all duration-500 ease-out
        border-white/10 ${positionClass}
        ${color}
        ${translateClass}
      `}
    >
      <div className={`p-6 rounded-full border border-white/10 mb-6 bg-neutral-950 ${isActive ? 'animate-bounce' : ''}`}>
        <Icon className={`w-8 h-8 ${textColor}`} />
      </div>
      <span className={`text-xs font-bold tracking-[0.3em] ${textColor}`} style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}>
        {label}
      </span>
      <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-transparent to-white/5 opacity-10 pointer-events-none mix-blend-overlay" />
    </div>
  )
}

export default ZenDashboard
