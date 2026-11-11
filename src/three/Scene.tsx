import { memo, useEffect, type MutableRefObject } from 'react'
import { useThree } from '@react-three/fiber'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { useSceneRig } from './useSceneRig'
import { SkyGradient, CelestialBody, EndOfRoadLight, SUN_OFFSET, MOON_OFFSET } from './lighting'
import { PostProcessing } from './PostProcessing'
import { Road } from './Road'
import { Street } from './Street'
import { Buildings } from './Buildings'
import { useFollowShadow } from './shadows'

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

  // The sun/moon light. Its shadow covers the stretch of city around the camera and is rendered
  // again only when the camera moves on to the next stretch.
  const isLight = theme === 'light'
  const lightOffset = isLight ? SUN_OFFSET : MOON_OFFSET
  const mainLightRef = useFollowShadow(lightOffset, [theme])

  const colors = THEME_COLORS[theme]

  return (
    <>
      <SkyGradient theme={theme} />
      {/* Thin haze: the near city is crisp, the skyline fades out over a couple of hundred units
          and the landmarks stand half-veiled behind it. */}
      <fogExp2 attach="fog" args={[colors.fog, isLight ? 0.0068 : 0.0085]} />

      {/* Sky and ground bounce instead of a flat ambient term: tops of things lighter than their
          undersides, as outdoors. */}
      <hemisphereLight args={[isLight ? '#ffffff' : '#9a9a9a', isLight ? '#7a7a7a' : '#111111', isLight ? 0.75 : 0.12]} />

      {/* Primary directional light aligned with sun/moon – casts onto road and buildings */}
      <directionalLight
        ref={mainLightRef}
        intensity={isLight ? 2.6 : 2.2}
        color="#ffffff"
        castShadow
        shadow-mapSize-width={perf.shadowMapSize}
        shadow-mapSize-height={perf.shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={160}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-bias={-0.0003}
        shadow-normalBias={0.03}
        shadow-radius={perf.tier === 'high' ? 6 : 3}
      />

      {/* Fill from the opposite side – softens building shadows. It casts no shadow: its default
          shadow frustum is 10 units wide and sits at the very start of the road, outside the
          camera's view, so the extra shadow pass and lookup never changed a visible pixel. */}
      <directionalLight
        position={theme === 'light' ? [-8, 20, -15] : [8, 20, -15]}
        intensity={theme === 'light' ? 0.45 : 0.25}
      />

      <CelestialBody isLight={theme === 'light'} segments={perf.celestialSegments} />
      <Road theme={theme} />
      <Street theme={theme} />
      <EndOfRoadLight />

      <Buildings
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        perf={perf}
      />

      <PostProcessing theme={theme} perf={perf} onReady={onReady} onSlowFrames={onSlowFrames} />
    </>
  )
})
