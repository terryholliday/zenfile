import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { extend } from '@react-three/fiber'
import { shaderMaterial } from '@react-three/drei'

// Define the shader material
const WaveMaterial = shaderMaterial(
    {
        uTime: 0,
        uColor: new THREE.Color(0.2, 0.4, 1.0),
        uOpacity: 0.6,
    },
    // Vertex Shader
    `
    varying vec2 vUv;
    varying float vElevation;
    uniform float uTime;

    void main() {
      vUv = uv;
      vec4 modelPosition = modelMatrix * vec4(position, 1.0);
      
      // Create a wave effect based on distance from center (assuming ring geometry)
      // or just animate based on time for now
      
      vec4 viewPosition = viewMatrix * modelPosition;
      vec4 projectionPosition = projectionMatrix * viewPosition;
      gl_Position = projectionPosition;
    }
  `,
    // Fragment Shader
    `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uOpacity;
    varying vec2 vUv;

    void main() {
      // Circular wave pattern
      float dist = distance(vUv, vec2(0.5));
      
      // Animate rings
      float ring = sin(dist * 20.0 - uTime * 5.0);
      float strength = 0.05 / abs(ring);
      
      // Fade out at edges
      strength *= (1.0 - dist * 2.0);

      gl_FragColor = vec4(uColor, strength * uOpacity);
    }
  `
)

extend({ WaveMaterial })

declare global {
    namespace JSX {
        interface IntrinsicElements {
            waveMaterial: any
        }
    }
}

export function TidalWave() {
    const materialRef = useRef<any>()

    useFrame((state, delta) => {
        if (materialRef.current) {
            materialRef.current.uTime += delta
        }
    })

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
            <planeGeometry args={[100, 100, 128, 128]} />
            {/* @ts-ignore */}
            <waveMaterial
                ref={materialRef}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    )
}
