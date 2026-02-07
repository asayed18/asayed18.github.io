import { useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../App'

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

  return (
    <mesh geometry={geometry} position={[0, 0, length / 2]} receiveShadow>
      <meshStandardMaterial
        color={theme === 'light' ? '#d8d8d8' : '#303030'}
        roughness={theme === 'light' ? 0.8 : 1.95}
        metalness={theme === 'light' ? 0.15 : 0.15}
      />
    </mesh>
  )
}
