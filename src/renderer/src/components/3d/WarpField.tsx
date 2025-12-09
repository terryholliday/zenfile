import { useRef, useMemo, useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface WarpFieldProps {
    isScanning: boolean
}

const AREA_WIDTH = 60
const AREA_HEIGHT = 60
const DEPTH = 100

export function WarpField({ isScanning }: WarpFieldProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null)
    const { camera } = useThree()
    const currentSpeed = useRef(10) // Start faster

    // Use useMemo for stable mutable data (ignore purity warning for random init)
    const stars = useMemo(() => {
        const temp: { x: number; y: number; z: number; scale: number; speedMultiplier: number }[] = []
        for (let i = 0; i < 6000; i++) { // Increased count
            // Wider area
            const x = (Math.random() - 0.5) * AREA_WIDTH * 3
            const y = (Math.random() - 0.5) * AREA_HEIGHT * 3
            const z = (Math.random() - 0.5) * DEPTH * 2
            const scale = Math.random() * 0.5 + 0.1 // Varied sizes
            const speedMultiplier = Math.random() * 0.8 + 0.2
            temp.push({ x, y, z, scale, speedMultiplier })
        }
        return temp
    }, [])

    const dummy = useMemo(() => new THREE.Object3D(), [])

    useLayoutEffect(() => {
        if (!meshRef.current) return

        // Initial placement setup
        stars.forEach((data, i) => {
            dummy.position.set(data.x, data.y, data.z)
            dummy.scale.set(data.scale, data.scale, data.scale)
            dummy.updateMatrix()
            meshRef.current!.setMatrixAt(i, dummy.matrix)
        })
        meshRef.current.instanceMatrix.needsUpdate = true
    }, [dummy, stars])

    useFrame((state, delta) => {
        if (!meshRef.current) return

        // 1. Orient to camera
        meshRef.current.lookAt(camera.position)

        // 2. Smooth acceleration
        // Idle speed 20 (cruising), Warp speed 150 (very fast)
        const targetSpeed = isScanning ? 150 : 20
        // Lerp current speed towards target
        // Use a lower factor (0.5) for gradual acceleration "rev up" feel
        currentSpeed.current = THREE.MathUtils.lerp(currentSpeed.current, targetSpeed, delta * 0.5)

        // Animate
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i]

            // Move towards camera (local +Z)
            star.z += (currentSpeed.current * star.speedMultiplier) * delta

            // Loop
            if (star.z > DEPTH) {
                star.z = -DEPTH
                star.x = (Math.random() - 0.5) * AREA_WIDTH * 3
                star.y = (Math.random() - 0.5) * AREA_HEIGHT * 3
            }

            dummy.position.set(star.x, star.y, star.z)

            // Stretch based on speed
            // Min stretch 1, max stretch 20
            const stretch = Math.max(1, Math.min(currentSpeed.current * 0.15, 20))
            dummy.scale.set(star.scale, star.scale, star.scale * stretch)

            dummy.updateMatrix()
            meshRef.current.setMatrixAt(i, dummy.matrix)
        }
        meshRef.current.instanceMatrix.needsUpdate = true
    })

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, stars.length]}>
            {/* Smaller base geometry for "star" look instead of blobs */}
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshBasicMaterial
                color="#ffffff"
                transparent={false}
                opacity={1.0}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
            />
        </instancedMesh>
    )
}
