import { memo, useEffect, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { useSceneRig } from './useSceneRig'
import { SkyGradient, CelestialBody, EndOfRoadLight, SUN_OFFSET, MOON_OFFSET } from './lighting'
import { PostProcessing } from './PostProcessing'
import { Road } from './Road'
import { Buildings } from './Buildings'
import { useStaticShadow } from './shadows'
import { ROAD_LENGTH } from './config'

const THEME_COLORS = {
  dark: {
    background: '#000000',
    fog: '#000000',
  },
  light: {
    background: '#ffffff',
    fog: '#ffffff',
  },
}

interface SceneProps {
  /** Scroll progress (0 to 1), read once per frame. */
  progressRef: MutableRefObject<number>
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
  onReady?: () => void
  onSlowFrames?: () => void
}

/**
 * Memoised, and fed the scroll position through a ref: the scene re-renders only when the active
 * experience or the theme changes, never per scroll event.
 */
export const Scene = memo(function Scene({
  progressRef,
  experiences,
  activeExperienceId,
  theme,
  perf,
  onReady,
  onSlowFrames,
}: SceneProps) {
  useSceneRig({ progressRef, activeExperienceId, experiences })

  // The canvas renders on demand: a new camera target or a new theme needs a fresh frame.
  const invalidate = useThree((state) => state.invalidate)
  useEffect(() => {
    invalidate()
  }, [activeExperienceId, theme, invalidate])

  // The sun/moon light and the city are static, so its shadow map is rendered once per theme
  // instead of once per frame.
  const mainLightRef = useStaticShadow<THREE.DirectionalLight>([theme])

  const colors = THEME_COLORS[theme]

  return (
    <>
      <SkyGradient theme={theme} />
      <fogExp2 attach="fog" args={[colors.fog, theme === 'light' ? 0.014 : 0.035]} />

      <ambientLight intensity={theme === 'light' ? 0.3 : 0.02} />

      {/* Primary directional light aligned with sun/moon – casts onto road and buildings */}
      <directionalLight
        ref={mainLightRef}
        position={theme === 'light' ? [SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z] : [MOON_OFFSET.x, MOON_OFFSET.y, MOON_OFFSET.z]}
        intensity={theme === 'light' ? 2.5 : 3.5}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={perf.shadowMapSize}
        shadow-mapSize-height={perf.shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
        shadow-radius={perf.tier === 'high' ? 8 : 4}
      />

      {/* Fill from the opposite side – softens building shadows. It casts no shadow: its default
          shadow frustum is 10 units wide and sits at the very start of the road, outside the
          camera's view, so the extra shadow pass and lookup never changed a visible pixel. */}
      <directionalLight
        position={theme === 'light' ? [-8, 20, -15] : [8, 20, -15]}
        intensity={theme === 'light' ? 0.65 : 0.55}
      />

      <CelestialBody isLight={theme === 'light'} segments={perf.celestialSegments} />
      <Road length={ROAD_LENGTH} theme={theme} />
      <EndOfRoadLight />

      <Buildings
        roadLength={ROAD_LENGTH}
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        perf={perf}
      />

      <PostProcessing theme={theme} perf={perf} onReady={onReady} onSlowFrames={onSlowFrames} />
    </>
  )
})
