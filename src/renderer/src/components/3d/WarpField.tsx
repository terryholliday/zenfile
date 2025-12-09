/* eslint-disable react/no-unknown-property */
import { useRef, useMemo, useLayoutEffect, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

interface WarpFieldProps {
    isScanning: boolean
}

const STAR_COUNT = 6000

// Helper to generate stars (spherical distribution for radial warp)
const generateStars = (): { vec: THREE.Vector3; initialDistance: number; speedMultiplier: number; scale: number }[] => {
    const temp: { vec: THREE.Vector3; initialDistance: number; speedMultiplier: number; scale: number }[] = []
    for (let i = 0; i < STAR_COUNT; i++) {
        // Random point in sphere
        const vec = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize()

        // Spread them out at different initial distances so they don't all start at center
        const initialDistance = Math.random() * 60 + 10 // Start between 10 and 70 units out
        const speedMultiplier = Math.random() * 0.5 + 0.5
        const scale = Math.random() * 0.5 + 0.2
        temp.push({ vec, initialDistance, speedMultiplier, scale })
    }
    return temp
}

export function WarpField({ isScanning }: WarpFieldProps): JSX.Element {
    const meshRef = useRef<THREE.InstancedMesh>(null)
    const currentSpeed = useRef(2) // Radial speed

    // Initialize stars directly in useMemo to avoid effect/state dance
    // We map them to include mutable currentDistance
    const stars = useMemo(() => {
        const data = generateStars()
        return data.map((d) => ({
            ...d,
            currentDistance: d.initialDistance
        }))
    }, [])

    const dummy = useMemo(() => new THREE.Object3D(), [])

    // Initial placement
    useLayoutEffect(() => {
        if (!meshRef.current) return
        stars.forEach((data, i) => {
            dummy.position.copy(data.vec).multiplyScalar(data.currentDistance)
            dummy.scale.set(data.scale, data.scale, data.scale)
            dummy.updateMatrix()
            meshRef.current!.setMatrixAt(i, dummy.matrix)
        })
        meshRef.current.instanceMatrix.needsUpdate = true
    }, [dummy, stars])

    useFrame((_state, delta) => {
        if (!meshRef.current) return

        // Note: No meshRef.current.lookAt(camera)
        // We want the explosion to be world-space centered

        // 2. Smooth acceleration
        // Idle speed: slow expansion. Warp speed: fast expansion.
        const targetSpeed = isScanning ? 40 : 2
        currentSpeed.current = THREE.MathUtils.lerp(currentSpeed.current, targetSpeed, delta * 0.8)

        // Animate
        for (let i = 0; i < stars.length; i++) {
            const star = stars[i]

            // Radial movement: increase distance
            star.currentDistance += currentSpeed.current * star.speedMultiplier * delta

            // Loop: if too far, reset to near center
            if (star.currentDistance > 100) {
                star.currentDistance = Math.random() * 20 + 5 // Reset close to center
            }

            // Position = vec * distance
            dummy.position.copy(star.vec).multiplyScalar(star.currentDistance)

            // Orientation: Point OUTWARDS from center to create streaks
            // lookAt target: position + vec (points away from center)
            const lookTarget = dummy.position.clone().add(star.vec)
            dummy.lookAt(lookTarget)

            // Stretch logic
            // Straighter lines for Star Trek look
            // Idle: 1.0 (dot). scanning: stretch up to 50x (very long streaks)
            const stretch = Math.max(1, Math.min(currentSpeed.current * 0.8, 50))

            // Make them thinner (0.2) to look like lines, stretching only on Z
            dummy.scale.set(star.scale * 0.2, star.scale * 0.2, star.scale * stretch)

            dummy.updateMatrix()
            meshRef.current.setMatrixAt(i, dummy.matrix)
        }
        meshRef.current.instanceMatrix.needsUpdate = true
    })

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, STAR_COUNT]}>
            {/* Cylinder looks better for streaks? Or highly scaled sphere. Sphere is fine. */}
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshBasicMaterial
                color="#e0f2fe" // Light cyan (Star Trek warp signature)
                transparent={false} // Performance
                opacity={1.0}
                blending={THREE.AdditiveBlending}
                toneMapped={false}
            />
        </instancedMesh>
    )
}
