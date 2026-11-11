import { useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../theme'
import { useTexture } from '@react-three/drei'
import { ROAD_WIDTH } from './config'

interface RoadProps {
  length: number
  theme: Theme
}

/**
 * The road used to carry a displacement map. On a plane with four vertices a displacement map
 * cannot add relief: it only lowered the whole plane by this constant amount, at the cost of an
 * extra 1K texture and a texture lookup in the vertex shader. The offset is kept so the road
 * markings sit exactly where they did.
 */
const ROAD_Y = -0.0305

export function Road({ length, theme }: RoadProps) {
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(ROAD_WIDTH * 10, length)
    g.rotateX(-Math.PI / 2)
    return g
  }, [length])

  const texture = useTexture([
    '/textures/Asphalt009_1K-JPG_Color.webp',
    '/textures/Asphalt009_1K-JPG_NormalGL.webp',
    '/textures/Asphalt009_1K-JPG_Roughness.webp',
  ])

  texture.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(20, 20)
  })

  return (
    <mesh geometry={geometry} position={[0, ROAD_Y, length / 2]} receiveShadow>
      <meshStandardMaterial
        map={texture[0]}
        normalMap={texture[1]}
        roughnessMap={texture[2]}
        color={theme === 'light' ? '#ffffff' : '#000000'}
        roughness={theme === 'light' ? 0.8 : 1.95}
        metalness={theme === 'light' ? 0.05 : 0.15}
      />
    </mesh>
  )
}
