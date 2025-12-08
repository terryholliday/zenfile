import { useRef, useMemo, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html } from '@react-three/drei'
import { useScanStore } from '../store/useScanStore'
import * as THREE from 'three'
import { FileNode, DuplicateCluster } from '../../../shared/types'
import { motion, AnimatePresence } from 'framer-motion'

// --- Utility Components ---

function FilePlanet({
  file,
  position,
  color,
  onClick
}: {
  file: FileNode
  position: [number, number, number]
  color: string
  onClick?: (file: FileNode) => void
}) {
  const meshRef = useRef<THREE.Mesh>(null)
  const [hovered, setHover] = useState(false)

  // Rotate the planet
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5
    }
  })

  // Size based on log scale of bytes, clamped
  const size = useMemo(() => {
    const logSize = Math.log10(file.sizeBytes || 1024)
    return Math.max(0.2, Math.min(logSize * 0.1, 1.5))
  }, [file.sizeBytes])

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.(file)
        }}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : color}
          emissive={color}
          emissiveIntensity={hovered ? 0.5 : 0.2}
          roughness={0.4}
          metalness={0.6}
        />
      </mesh>
      {hovered && (
        <Html distanceFactor={15}>
          <div className="bg-black/80 text-white p-2 rounded border border-white/20 text-xs whitespace-nowrap pointer-events-none">
            <div className="font-bold">{file.name}</div>
            <div className="text-gray-400">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</div>
          </div>
        </Html>
      )}
    </group>
  )
}

function DuplicateSystem({
  cluster,
  position,
  onClick
}: {
  cluster: DuplicateCluster
  position: [number, number, number]
  onClick?: (cluster: DuplicateCluster) => void
}) {
  const groupRef = useRef<THREE.Group>(null)
  const [hovered, setHover] = useState(false)

  // Rotate the whole system
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.2
    }
  })

  return (
    <group
      position={position}
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(cluster)
      }}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      {/* Central Star for the Cluster */}
      <mesh>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          color={hovered ? '#ffaa00' : '#ff4400'}
          emissive="#ff4400"
          emissiveIntensity={2}
        />
      </mesh>

      {/* Orbiting Duplicate Files */}
      {cluster.files.slice(0, 5).map((file, i) => {
        const angle = (i / cluster.files.length) * Math.PI * 2
        const radius = 1.2
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        return (
          <mesh key={file.id} position={[x, 0, z]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color="#ff8800" />
          </mesh>
        )
      })}
      {hovered && (
        <Html distanceFactor={15}>
          <div className="bg-black/80 text-white p-2 rounded border border-red-500/50 text-xs whitespace-nowrap pointer-events-none">
            <div className="font-bold">{cluster.files.length} Duplicates</div>
            <div className="text-gray-400">Match: {cluster.hash.substring(0, 8)}...</div>
          </div>
        </Html>
      )}
    </group>
  )
}

// --- Main Galaxy Scene ---

export function ZenGalaxy() {
  const { largeFiles, duplicates } = useScanStore()
  const [selectedObject, setSelectedObject] = useState<FileNode | DuplicateCluster | null>(null)

  // Calculate positions in a spiral
  const largeFilePositions = useMemo(() => {
    return largeFiles.map((file, i) => {
      const angle = i * 0.5
      const radius = 5 + i * 0.5 // Spiral out
      // Use deterministic "random" based on index
      const height = Math.sin(i * 137.5) * 2
      return {
        file,
        position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius] as [
          number,
          number,
          number
        ]
      }
    })
  }, [largeFiles])

  const duplicatePositions = useMemo(() => {
    return duplicates.map((cluster, i) => {
      const angle = i * 0.8 + Math.PI // Offset phase
      const radius = 8 + i * 0.8
      // Use deterministic "random" based on index
      const height = Math.cos(i * 42.1) * 4
      return {
        cluster,
        position: [Math.cos(angle) * radius, height, Math.sin(angle) * radius] as [
          number,
          number,
          number
        ]
      }
    })
  }, [duplicates])

  return (
    <div className="w-full h-full relative" style={{ background: '#050505' }}>
      <Canvas camera={{ position: [0, 20, 25], fov: 45 }}>
        <color attach="background" args={['#050505']} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        <ambientLight intensity={0.2} />
        <pointLight position={[10, 10, 10]} intensity={1.5} color="#4c1d95" />
        <pointLight position={[-10, -10, -10]} intensity={0.5} color="#ef4444" />

        <OrbitControls
          enablePan={true}
          enableZoom={true}
          maxDistance={100}
          minDistance={5}
          autoRotate
          autoRotateSpeed={0.5}
        />

        {/* Central Hub */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[1, 32, 32]} />
          <meshStandardMaterial color="#4f46e5" emissive="#4f46e5" emissiveIntensity={2} />
        </mesh>

        {/* Large Files (Blue/Cool System) */}
        {largeFilePositions.map(({ file, position }) => (
          <FilePlanet
            key={file.id}
            file={file}
            position={position}
            color="#6366f1"
            onClick={(f) => setSelectedObject(f)}
          />
        ))}

        {/* Duplicates (Red/Hot System) */}
        {duplicatePositions.map(({ cluster, position }) => (
          <DuplicateSystem
            key={cluster.hash}
            cluster={cluster}
            position={position}
            onClick={(c) => setSelectedObject(c)}
          />
        ))}
      </Canvas>

      {/* Overlay UI for Selection */}
      <AnimatePresence>
        {selectedObject && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute top-4 right-4 w-80 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl p-4 text-white shadow-2xl"
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-lg font-bold text-indigo-400">
                {'files' in selectedObject ? 'Duplicate Cluster' : 'Large File'}
              </h3>
              <button
                onClick={() => setSelectedObject(null)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {'files' in selectedObject ? (
              // Duplicate Cluster View
              <div className="space-y-2">
                <p className="text-sm text-gray-300">
                  {(selectedObject as DuplicateCluster).files.length} copies found.
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-2">
                  {(selectedObject as DuplicateCluster).files.map((f) => (
                    <div
                      key={f.id}
                      className="text-xs bg-white/5 p-2 rounded truncate"
                      title={f.path}
                    >
                      {f.name}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Single File View
              <div className="space-y-2">
                <div className="text-sm font-mono break-all text-gray-300">
                  {(selectedObject as FileNode).path}
                </div>
                <div className="text-2xl font-bold">
                  {((selectedObject as FileNode).sizeBytes / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
