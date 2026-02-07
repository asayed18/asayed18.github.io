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
    const g = new THREE.PlaneGeometry(ROAD_WIDTH, length)
    g.rotateX(-Math.PI / 2)
    return g
  }, [length])

  return (
    <mesh geometry={geometry} position={[0, 0, length / 2]}>
      <meshStandardMaterial color={theme === 'light' ? '#d8d8d8' : '#303030'} />
    </mesh>
  )
}
