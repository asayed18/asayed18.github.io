import type { Experience } from '../data/experiences'
import type { Theme } from '../App'
import type { PerfPreset } from '../utils/devicePerf'
import { useSceneRig } from './useSceneRig'
import { SkyGradient, CelestialBody, EndOfRoadLight, SUN_OFFSET, MOON_OFFSET } from './lighting'
import { PostProcessing } from './PostProcessing'
import { Road } from './Road'
import { Buildings } from './Buildings'
import { ROAD_LENGTH } from './config'

const THEME_COLORS = {
  dark: {
    background: '#1a1a1a',
    fog: '#1a1a1a',
  },
  light: {
    background: '#f5f5f5',
    fog: '#d8d8d8',
  },
}

interface SceneProps {
  scrollProgress: number
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
  onReady?: () => void
}

export function Scene({ scrollProgress, experiences, activeExperienceId, theme, perf, onReady }: SceneProps) {
  const { handleBuildingsReady } = useSceneRig({
    scrollProgress,
    activeExperienceId,
    experiences,
    perf,
    onReady,
  })

  const colors = THEME_COLORS[theme]

  return (
    <>
      <SkyGradient theme={theme} />
      <fog attach="fog" args={[colors.fog, 100, 1000]} />
      <fogExp2 attach="fog" args={[colors.fog, theme === 'light' ? 0.014 : 0.027]} />

      <ambientLight intensity={theme === 'light' ? 0.2 : 0.5} />

      {/* Primary directional light aligned with sun/moon – casts onto road and buildings */}
      <directionalLight
        position={theme === 'light' ? [SUN_OFFSET.x, SUN_OFFSET.y, SUN_OFFSET.z] : [MOON_OFFSET.x, MOON_OFFSET.y, MOON_OFFSET.z]}
        intensity={theme === 'light' ? 1.65 : 2.1}
        color={theme === 'light' ? '#ebebeb' : '#d0d0d0'}
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

      {/* Fill from opposite side – softens building shadows; shadow only on high tier to save cost */}
      <directionalLight
        position={theme === 'light' ? [-8, 20, -15] : [8, 20, -15]}
        intensity={theme === 'light' ? 0.65 : 0.55}
        castShadow={perf.tier === 'high'}
        shadow-mapSize-width={256}
        shadow-mapSize-height={256}
        shadow-radius={3}
        shadow-bias={-0.0002}
        shadow-normalBias={0.02}
      />

      <CelestialBody isLight={theme === 'light'} segments={perf.celestialSegments} />
      <Road length={ROAD_LENGTH} theme={theme} />
      <EndOfRoadLight theme={theme} segments={perf.celestialSegments} />

      <Buildings
        roadLength={ROAD_LENGTH}
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        perf={perf}
        onReady={handleBuildingsReady}
      />

      <PostProcessing theme={theme} perf={perf} />
    </>
  )
}
