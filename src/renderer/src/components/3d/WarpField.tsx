import { useRef, useMemo, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface WarpFieldProps {
    isScanning: boolean
}

const STAR_COUNT = 2000
const AREA_WIDTH = 60
const AREA_HEIGHT = 60
const DEPTH = 100

export function WarpField({ isScanning }: WarpFieldProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null)

    // Store initial positions and speeds
    const stars = useMemo(() => {
        const temp: { x: number; y: number; z: number; scale: number; speedMultiplier: number }[] = []
        for (let i = 0; i < STAR_COUNT; i++) {
            const x = (Math.random() - 0.5) * AREA_WIDTH
            const y = (Math.random() - 0.5) * AREA_HEIGHT
            // Distribute stars along the depth
            const z = (Math.random() - 0.5) * DEPTH * 2
            const scale = Math.random() * 0.15 + 0.05
            const speedMultiplier = Math.random() * 0.5 + 0.5
            temp.push({ x, y, z, scale, speedMultiplier })
        }
        return temp
    }, [])

    const dummy = useMemo(() => new THREE.Object3D(), [])

    useLayoutEffect(() => {
        if (!meshRef.current) return

        // Initial placement
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

        const baseSpeed = isScanning ? 40 : 2 // Fast warp vs slow drift

        // Animate each star
        for (let i = 0; i < STAR_COUNT; i++) {
            const star = stars[i]

            // Move star towards camera (positive Z)
            star.z += (baseSpeed * star.speedMultiplier + (isScanning ? 0 : 0.5)) * delta

            // Loop stars
            if (star.z > 20) { // If it passes the camera
                star.z = -DEPTH
                // Randomize X/Y slightly on respawn for variety
                star.x = (Math.random() - 0.5) * AREA_WIDTH
                star.y = (Math.random() - 0.5) * AREA_HEIGHT
            }

            dummy.position.set(star.x, star.y, star.z)

            // Stretch stars when warping
            const stretch = isScanning ? Math.min(star.speedMultiplier * 5, 4) : 1
            dummy.scale.set(star.scale, star.scale, star.scale * stretch)

            dummy.updateMatrix()
            meshRef.current.setMatrixAt(i, dummy.matrix)
        }
        meshRef.current.instanceMatrix.needsUpdate = true
    })

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={isScanning ? 0.6 : 0.8}
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    )
}
