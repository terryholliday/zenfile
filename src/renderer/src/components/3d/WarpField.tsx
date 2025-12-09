import { useRef, useMemo, useLayoutEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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
    const { camera } = useThree()
    const currentSpeed = useRef(2)

    // Store initial positions and speeds
    const stars = useMemo(() => {
        const temp: { x: number; y: number; z: number; scale: number; speedMultiplier: number }[] = []
        for (let i = 0; i < STAR_COUNT; i++) {
            // Create a wider area to cover the field of view when rotated
            const x = (Math.random() - 0.5) * AREA_WIDTH * 2
            const y = (Math.random() - 0.5) * AREA_HEIGHT * 2
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

        // 1. Orient the entire field to face the camera so stars fly AT the user
        // We want the local +Z axis (movement direction) to point at the camera
        meshRef.current.lookAt(camera.position)

        // 2. Smooth acceleration
        const targetSpeed = isScanning ? 40 : 0.5
        // Lerp current speed towards target
        currentSpeed.current = THREE.MathUtils.lerp(currentSpeed.current, targetSpeed, delta * 2)

        // Animate each star relative to the mesh's local space
        for (let i = 0; i < STAR_COUNT; i++) {
            const star = stars[i]

            // Move star in local Z (which is now pointed at camera)
            star.z += (currentSpeed.current * star.speedMultiplier) * delta

            // Loop stars
            if (star.z > DEPTH) {
                star.z = -DEPTH
                // Randomize X/Y on respawn
                star.x = (Math.random() - 0.5) * AREA_WIDTH * 2
                star.y = (Math.random() - 0.5) * AREA_HEIGHT * 2
            }

            dummy.position.set(star.x, star.y, star.z)

            // Stretch stars when warping
            // Calculate stretch based on speed, clamped
            const stretch = Math.max(1, Math.min(currentSpeed.current * 0.2, 8))
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
                opacity={Math.min(0.8, isScanning ? 0.6 : 0.4)} // Dim slightly when fast to reduce glare
                blending={THREE.AdditiveBlending}
            />
        </instancedMesh>
    )
}
