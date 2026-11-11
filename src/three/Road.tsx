import { useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../theme'
import { useTexture } from '@react-three/drei'
import { ROAD_WIDTH } from './config'
import { useCityEnvironment } from './environment'

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

/** Size of one asphalt texture tile, in world units. */
const ROAD_TILE = 2.5

/** Side of the square ground plane: well past where the fog hides everything. */
const GROUND_SIZE = 900

export function Road({ length, theme }: RoadProps) {
  const geometry = useMemo(() => {
    // Asphalt under the carriageway only; the city stands on the ground plane below.
    const g = new THREE.PlaneGeometry(ROAD_WIDTH, length + 40)
    g.rotateX(-Math.PI / 2)
    return g
  }, [length])

  const texture = useTexture([
    '/textures/Asphalt009_1K-JPG_Color.webp',
    '/textures/Asphalt009_1K-JPG_NormalGL.webp',
    '/textures/Asphalt009_1K-JPG_Roughness.webp',
  ])

  // A faint reflection makes the night road read as damp asphalt instead of a black plane.
  const envMap = useCityEnvironment()

  texture.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    // One tile per 2.5 units in both directions: asphalt grain at the same scale as the city.
    tex.repeat.set(ROAD_WIDTH / ROAD_TILE, (length + 40) / ROAD_TILE)
  })

  return (
    <>
      {/* Ground under the city, the pyramids and the horizon: plain paving and earth that the
          fog fades out, so the world has no visible edge. */}
      <mesh position={[0, ROAD_Y - 0.02, length / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial color={theme === 'light' ? '#bdbdbd' : '#0a0a0a'} roughness={0.95} />
      </mesh>
    <mesh geometry={geometry} position={[0, ROAD_Y, length / 2]} receiveShadow>
      <meshStandardMaterial
        map={texture[0]}
        normalMap={texture[1]}
        roughnessMap={texture[2]}
        color={theme === 'light' ? '#ffffff' : '#000000'}
        envMap={envMap}
        envMapIntensity={theme === 'light' ? 0.15 : 0.22}
        roughness={theme === 'light' ? 0.8 : 0.7}
        metalness={theme === 'light' ? 0.05 : 0.3}
      />
    </mesh>
    </>
  )
}
