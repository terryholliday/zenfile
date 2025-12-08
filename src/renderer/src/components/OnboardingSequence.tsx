import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Check, FileText, Image as ImageIcon, Trash2 } from 'lucide-react'
import ZenScanner from './ZenScanner'

type DemoFileStatus = 'raw' | 'processing' | 'done'
type DemoFileType = 'doc' | 'img' | 'exe'

interface DemoFile {
  id: number
  name: string
  type: DemoFileType
  status: DemoFileStatus
  newName: string
  folder: string
}

interface OnboardingSequenceProps {
  onComplete: () => void
}

export function OnboardingSequence({ onComplete }: OnboardingSequenceProps) {
  const [step, setStep] = useState(0)
  const [demoFiles, setDemoFiles] = useState<DemoFile[]>([
    { id: 1, name: 'Scan_2992.pdf', type: 'doc', status: 'raw', newName: 'Invoice_HomeDepot.pdf', folder: 'Financials' },
    { id: 2, name: 'IMG_0023.jpg', type: 'img', status: 'raw', newName: 'Kitchen_Reference.jpg', folder: 'Projects' },
    { id: 3, name: 'setup_v2.exe', type: 'exe', status: 'raw', newName: 'Installer (Junk)', folder: 'Trash' }
  ])

  const updateFileStatus = useCallback((id: number, status: DemoFileStatus) => {
    setDemoFiles((prev) => prev.map((file) => (file.id === id ? { ...file, status } : file)))
  }, [])

  useEffect(() => {
    if (step !== 2) return

    const timers: ReturnType<typeof setTimeout>[] = []
    const queue = (delay: number, fn: () => void) => timers.push(setTimeout(fn, delay))

    queue(500, () => updateFileStatus(1, 'processing'))
    queue(1500, () => updateFileStatus(1, 'done'))

    queue(2000, () => updateFileStatus(2, 'processing'))
    queue(3000, () => updateFileStatus(2, 'done'))

    queue(3500, () => updateFileStatus(3, 'processing'))
    queue(4500, () => updateFileStatus(3, 'done'))

    queue(5500, () => setStep(3))

    return () => timers.forEach(clearTimeout)
  }, [step, updateFileStatus])

  return (
    <div className="fixed inset-0 z-[60] bg-void flex flex-col items-center justify-center text-white overflow-hidden px-6">
      {step === 0 && (
        <div className="text-center animate-fade-in-up space-y-6">
          <h1 className="text-5xl font-light tracking-tighter text-nebula-blue">Entropy is inevitable.</h1>
          <p className="text-gray-400 text-lg">But organization can be effortless.</p>
          <button
            onClick={() => setStep(1)}
            className="group relative px-8 py-4 bg-void-light border border-nebula-blue/30 rounded-full hover:border-nebula-blue hover:shadow-[0_0_30px_rgba(79,140,255,0.4)] transition-all duration-500"
          >
            <span className="text-nebula-blue tracking-widest uppercase text-sm font-bold group-hover:text-white transition-colors">
              Begin the Harmonization
            </span>
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="relative scale-150 transition-transform duration-1000 cursor-pointer" onClick={() => setStep(2)}>
          <ZenScanner />
          <div className="absolute -bottom-6 w-full text-center">
            <span className="text-nebula-purple animate-pulse">Analyzing 12,402 items...</span>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="w-full max-w-2xl px-2 animate-fade-in">
          <h2 className="text-2xl font-light text-center mb-12 text-gray-300">I found a few things that need a home...</h2>

          <div className="space-y-6">
            {demoFiles.map((file) => (
              <DemoFileRow key={file.id} file={file} />
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center animate-fade-in space-y-6">
          <div className="w-24 h-24 bg-nebula-teal/20 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(42,245,230,0.4)]">
            <Check className="w-10 h-10 text-nebula-teal" />
          </div>
          <h1 className="text-4xl font-light">You are ready.</h1>
          <p className="text-gray-400">Your universe awaits.</p>
          <button
            onClick={onComplete}
            className="px-8 py-3 bg-nebula-blue text-void font-bold rounded hover:bg-white transition-colors"
          >
            Enter Dashboard
          </button>
        </div>
      )}
    </div>
  )
}

function DemoFileRow({ file }: { file: DemoFile }) {
  const isDone = file.status === 'done'
  const isProcessing = file.status === 'processing'

  return (
    <div
      className={`
        flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/5
        transition-all duration-700
        ${isDone ? 'translate-x-[100px] opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${file.type === 'exe' ? 'bg-nebula-alert/20' : 'bg-nebula-blue/20'}`}>
          {file.type === 'img' ? (
            <ImageIcon className="w-5 h-5 text-nebula-blue" />
          ) : file.type === 'exe' ? (
            <Trash2 className="w-5 h-5 text-nebula-alert" />
          ) : (
            <FileText className="w-5 h-5 text-nebula-blue" />
          )}
        </div>

        <div className="flex flex-col">
          <div className="relative h-6 w-64 overflow-hidden">
            <span
              className={`absolute left-0 top-0 text-gray-400 transition-all duration-500 ${isProcessing ? '-translate-y-full opacity-0' : 'translate-y-0'}`}
            >
              {file.name}
            </span>
            <span
              className={`absolute left-0 top-0 text-white font-mono transition-all duration-500 ${isProcessing ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
            >
              {file.newName}
            </span>
          </div>
          <span className="text-xs text-gray-600">Detected via Content Analysis</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <ArrowRight
          className={`w-4 h-4 text-gray-600 transition-all ${isProcessing ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
        />
        <div
          className={`
             px-3 py-1 rounded text-xs tracking-wider uppercase border
             transition-all duration-500
             ${isProcessing ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}
             ${file.type === 'exe' ? 'border-nebula-alert text-nebula-alert' : 'border-nebula-purple text-nebula-purple'}
          `}
        >
          {file.folder}
        </div>
      </div>
    </div>
  )
}

export default OnboardingSequence
