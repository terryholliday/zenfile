import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars, Html, Sparkles, Float } from '@react-three/drei'
import { useScanStore } from '../store/useScanStore'
import { FileNode, DuplicateCluster } from '../../../shared/types'
import * as THREE from 'three'
import { TidalWave } from './3d/TidalWave'

// --- Visual Components ---

function FilePlanet({ file, position, color, onClick }: { file: FileNode; position: [number, number, number]; color: string; onClick?: (file: FileNode) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);

  // Rotate the planet
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
    }
  });

  // Size based on log scale of bytes, clamped
  const size = useMemo(() => {
    const logSize = Math.log10(file.sizeBytes || 1024);
    return Math.max(0.4, Math.min(logSize * 0.15, 2.0));
  }, [file.sizeBytes]);

  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh
          ref={meshRef}
          onClick={(e) => { e.stopPropagation(); onClick?.(file); }}
          onPointerOver={() => setHover(true)}
          onPointerOut={() => setHover(false)}
        >
          <sphereGeometry args={[size, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={hovered ? 0.8 : 0.2}
            roughness={0.7}
            metalness={0.1}
          />
        </mesh>
        {/* Atmosphere Glow */}
        <mesh scale={[1.2, 1.2, 1.2]}>
          <sphereGeometry args={[size, 32, 32]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            side={THREE.BackSide}
          />
        </mesh>
      </Float>
      {hovered && (
        <Html distanceFactor={15}>
          <div className="bg-black/90 text-white p-3 rounded-lg border border-indigo-500/50 backdrop-blur-xl shadow-2xl pointer-events-none transform translate-y-[-100%]">
            <div className="font-bold text-sm mb-1">{file.name}</div>
            <div className="text-gray-400 text-xs text-nowrap">{(file.sizeBytes / 1024 / 1024).toFixed(2)} MB</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function DuplicateSun({ cluster, position, onClick }: { cluster: DuplicateCluster; position: [number, number, number]; onClick?: (cluster: DuplicateCluster) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const [hovered, setHover] = useState(false);

  // Rotate the system
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.1;
    }
  });

  return (
    <group position={position}
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); onClick?.(cluster); }}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
      <Float speed={1} rotationIntensity={0.2} floatIntensity={0.2}>
        {/* Central Sun */}
        <mesh>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshStandardMaterial
            color="#ff6600"
            emissive="#ff4400"
            emissiveIntensity={hovered ? 3 : 1.5}
            toneMapped={false}
          />
          <pointLight intensity={2} distance={10} color="#ffaa00" />
        </mesh>

        {/* Inner Glow */}
        <mesh scale={[1.1, 1.1, 1.1]}>
          <sphereGeometry args={[1.2, 32, 32]} />
          <meshBasicMaterial color="#ffaa00" transparent opacity={0.3} />
        </mesh>

        {/* Orbiting Debris (Duplicates) */}
        <Sparkles count={20} scale={4} size={3} speed={0.4} opacity={0.7} color="#ffaa00" />

        {/* Specific Orbiting Planets for files */}
        {cluster.files.map((file, i) => {
          const angle = (i / cluster.files.length) * Math.PI * 2;
          const radius = 2.5;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          return (
            <group key={file.id} position={[x, 0, z]}>
              <mesh>
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshStandardMaterial color="#ffccaa" emissive="#ff8800" emissiveIntensity={0.5} />
              </mesh>
            </group>
          );
        })}
      </Float>

      {hovered && (
        <Html distanceFactor={15}>
          <div className="bg-black/90 text-white p-3 rounded-lg border border-red-500/50 backdrop-blur-xl shadow-2xl pointer-events-none w-48 text-center transform translate-y-[-100%]">
            <div className="font-bold text-red-400 text-sm uppercase tracking-wider mb-1">Duplicate Cluster</div>
            <div className="text-2xl font-mono mb-1">{cluster.files.length}</div>
            <div className="text-[10px] text-gray-500 truncate">{cluster.hash.substring(0, 12)}...</div>
          </div>
        </Html>
      )}
    </group>
  );
}

// --- Main Galaxy Scene ---

interface ZenGalaxyProps {
  onClusterSelect?: (cluster: DuplicateCluster) => void;
}

export function ZenGalaxy({ onClusterSelect }: ZenGalaxyProps) {
  const { largeFiles, duplicates, scanState } = useScanStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Delay rendering slightly to allow transitions
    const t = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Calculate positions in a spiral
  const largeFilePositions = useMemo(() => {
    return largeFiles.map((file, i) => {
      const angle = i * 0.5;
      const radius = 8 + (i * 0.8); // Wider spiral
      // Use deterministic "random" based on index
      const height = Math.sin(i * 137.5) * 5;
      return {
        file,
        position: [
          Math.cos(angle) * radius,
          height,
          Math.sin(angle) * radius
        ] as [number, number, number]
      };
    });
  }, [largeFiles]);

  const duplicatePositions = useMemo(() => {
    return duplicates.map((cluster, i) => {
      const angle = (i * 0.8) + Math.PI; // Offset phase
      const radius = 12 + (i * 1.2);
      // Use deterministic "random" based on index
      const height = Math.cos(i * 42.1) * 8;
      return {
        cluster,
        position: [
          Math.cos(angle) * radius,
          height,
          Math.sin(angle) * radius
        ] as [number, number, number]
      };
    });
  }, [duplicates]);

  return (
    <Canvas camera={{ position: [0, 20, 35], fov: 60 }}>
      {/* Cinematic Lighting and Environment */}
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 20, 90]} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <Sparkles count={500} scale={50} size={2} speed={0.4} opacity={0.5} noise={0.2} color="#ffffff" />
      <TidalWave isActive={scanState === 'SCANNING'} speed={0.2} />

      {/* Content */}
      {ready && (
        <>
          {/* Large Files as Blue/Teal Planets */}
          {largeFilePositions.map(({ file, position }, i) => (
            <FilePlanet
              key={file.id}
              file={file}
              position={position}
              color={i % 2 === 0 ? "#4f46e5" : "#06b6d4"}
            />
          ))}

          {/* Duplicates as Burning Suns */}
          {duplicatePositions.map(({ cluster, position }) => (
            <DuplicateSun
              key={cluster.hash}
              cluster={cluster}
              position={position}
              onClick={(c) => onClusterSelect?.(c)}
            />
          ))}
        </>
      )}

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        autoRotate
        autoRotateSpeed={0.5}
        maxDistance={80}
        minDistance={5}
      />
    </Canvas>
  )
}
