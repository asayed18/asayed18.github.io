import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Theme } from '../theme'
import { useTexture } from '@react-three/drei'
import { ROAD_WIDTH } from './config'
import { useCityEnvironment } from './environment'
import { ROAD_LEAD_IN, ROAD_LEAD_OUT, ROAD_LENGTH } from './path'
import { sweepProfile } from './sweep'
import { groundAOCompile, groundAOKey } from './groundAO'

interface RoadProps {
  theme: Theme
}

/** Height of the asphalt; the markings and the date labels sit just above it. */
const ROAD_Y = -0.0305

/** Size of one asphalt texture tile, in world units. */
const ROAD_TILE = 2.5

/** Side of the square ground plane: well past where the fog hides everything. */
const GROUND_SIZE = 1400

export function Road({ theme }: RoadProps) {
  const geometry = useMemo(() => {
    const hw = ROAD_WIDTH / 2
    const g = sweepProfile([{ l0: -hw, y0: ROAD_Y, l1: hw, y1: ROAD_Y }], {
      from: -ROAD_LEAD_IN,
      to: ROAD_LENGTH + ROAD_LEAD_OUT,
      step: 1,
      tile: ROAD_TILE,
    })
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  const texture = useTexture([
    '/textures/Asphalt009_1K-JPG_Color.webp',
    '/textures/Asphalt009_1K-JPG_NormalGL.webp',
    '/textures/Asphalt009_1K-JPG_Roughness.webp',
  ])
  texture.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    // The geometry's UVs are already in tiles of ROAD_TILE units.
    tex.repeat.set(1, 1)
    tex.anisotropy = 8
  })

  // A faint reflection makes the night road read as damp asphalt instead of a black plane.
  const envMap = useCityEnvironment()
  const isLight = theme === 'light'

  return (
    <>
      {/* Ground under the city, the pyramids and the horizon: plain paving and earth that the
          fog fades out, so the world has no visible edge. */}
      <mesh position={[0, ROAD_Y - 0.02, 160]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[GROUND_SIZE, GROUND_SIZE]} />
        <meshStandardMaterial
          color={isLight ? '#aaa69e' : '#5f5c57'}
          roughness={0.95}
          onBeforeCompile={groundAOCompile}
          customProgramCacheKey={groundAOKey}
        />
      </mesh>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          map={texture[0]}
          normalMap={texture[1]}
          roughnessMap={texture[2]}
          color={isLight ? '#ffffff' : '#8c8c8c'}
          envMap={envMap}
          envMapIntensity={isLight ? 0.15 : 0.35}
          roughness={isLight ? 0.85 : 0.6}
          metalness={isLight ? 0.05 : 0.2}
          onBeforeCompile={groundAOCompile}
          customProgramCacheKey={groundAOKey}
        />
      </mesh>
    </>
  )
}
