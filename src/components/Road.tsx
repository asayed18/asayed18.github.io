import { useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../App'
import { useTexture } from '@react-three/drei'

const ROAD_WIDTH = 10

interface RoadProps {
  length: number
  theme: Theme
}

export function Road({ length, theme }: RoadProps) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(ROAD_WIDTH*10, length)
    g.rotateX(-Math.PI / 2)
    return g
  }, [length])

  const texture = useTexture([
    '/textures/Asphalt009_1K-JPG_Color.jpg',
    '/textures/Asphalt009_1K-JPG_NormalGL.jpg',      // Use GL version
    '/textures/Asphalt009_1K-JPG_Roughness.jpg',
    '/textures/Asphalt009_1K-JPG_Displacement.jpg'
  ])
  // [colorMap, normalMap, roughnessMap, dispMap]
  
  texture.forEach(texture => {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(20, 20)
  })

  return (
    <mesh geometry={geometry} position={[0, 0, length / 2]} receiveShadow>
      <meshStandardMaterial
        map={texture[0]}
        normalMap={texture[1]}
        roughnessMap={texture[2]}
        displacementMap={texture[3]}
        displacementScale={-0.05}     // Subtle bumps
        color={theme === 'light' ? '#d8d8d8' : '#303030'}
        roughness={theme === 'light' ? 0.8 : 1.95}
        metalness={theme === 'light' ? 0.15 : 0.15}
      />
    </mesh>
  )
}
