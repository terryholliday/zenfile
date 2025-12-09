/* eslint-disable react/no-unknown-property */
import { useRef, useMemo, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface WarpFieldProps {
    isScanning: boolean
}

const PARTICLE_COUNT = 3000

// Helper to generate particles in a "Cloud/Galaxy" distribution
const generateParticles = (): {
    vec: THREE.Vector3
    initialRadius: number
    speedMultiplier: number
    scale: number
    phase: number
}[] => {
    const temp: {
        vec: THREE.Vector3
        initialRadius: number
        speedMultiplier: number
        scale: number
        phase: number
    }[] = []

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Disc/Galaxy shape with some vertical spread
        const angle = Math.random() * Math.PI * 2
        const radius = Math.random() * 60 + 10 // 10 to 70
        const height = (Math.random() - 0.5) * 20 // -10 to 10

        // Convert to cartesian
        const x = Math.cos(angle) * radius
        const z = Math.sin(angle) * radius
        const y = height

        const vec = new THREE.Vector3(x, y, z)

        const speedMultiplier = Math.random() * 0.5 + 0.1 // Slower speeds
        const scale = Math.random() * 0.15 + 0.05 // Smaller, dust-like
        const phase = Math.random() * Math.PI * 2 // Independent oscillation

        temp.push({ vec, initialRadius: radius, speedMultiplier, scale, phase })
    }
    return temp
}

export function WarpField({ isScanning }: WarpFieldProps): JSX.Element {
    const meshRef = useRef<THREE.InstancedMesh>(null)
    const timeRef = useRef(0)

    // Store particle data
    const particlesRef = useRef<
        {
            vec: THREE.Vector3
            initialRadius: number
            speedMultiplier: number
            scale: number
            phase: number
        }[]
    >([])

    const dummy = useMemo(() => new THREE.Object3D(), [])

    useLayoutEffect(() => {
        particlesRef.current = generateParticles()
    }, [])

    useFrame((_state, delta) => {
        if (!meshRef.current) return

        // "Zen" time flows slowly, but accelerates slightly during scanning
        const timeScale = isScanning ? 2.0 : 0.5
        timeRef.current += delta * timeScale

        const particles = particlesRef.current
        for (let i = 0; i < particles.length; i++) {
            const p = particles[i]

            // Calculate gentle orbit
            // Angular velocity decreases with radius (Kepler-ish but stylized)
            const orbitSpeed = (0.2 / (p.initialRadius * 0.1)) * p.speedMultiplier
            const currentAngle = Math.atan2(p.vec.z, p.vec.x) + timeRef.current * orbitSpeed

            // Add gentle "breathing" or "wave" motion on Y axis
            const hover = Math.sin(timeRef.current * 0.5 + p.phase) * 1.5

            const x = Math.cos(currentAngle) * p.initialRadius
            const z = Math.sin(currentAngle) * p.initialRadius
            const y = p.vec.y + hover

            dummy.position.set(x, y, z)

            // Subtle rotation of the particle itself
            dummy.rotation.x = timeRef.current * p.speedMultiplier
            dummy.rotation.y = timeRef.current * p.speedMultiplier * 0.5

            // Pulse scale slightly
            const pulse = 1 + Math.sin(timeRef.current * 2 + p.phase) * 0.2
            dummy.scale.set(p.scale * pulse, p.scale * pulse, p.scale * pulse)

            dummy.updateMatrix()
            meshRef.current.setMatrixAt(i, dummy.matrix)
        }
        meshRef.current.instanceMatrix.needsUpdate = true
    })

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, PARTICLE_COUNT]}>
            {/* Tetrahedron for a crystalline dust look, or simple sphere */}
            <sphereGeometry args={[1, 4, 4]} />
            <meshStandardMaterial
                color="#a5b4fc" // Indigo-200, soft calm purple-blue
                emissive="#818cf8" // Indigo-400
                emissiveIntensity={0.5}
                roughness={0.8}
                metalness={0.2}
                transparent={true}
                opacity={0.6}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    )
}
