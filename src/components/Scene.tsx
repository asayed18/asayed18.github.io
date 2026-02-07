import { useRef, useCallback, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, SSAO, Noise, Vignette, Bloom } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../App'
import { Road } from './Road'
import { Buildings } from './Buildings'

const ROAD_LENGTH = 200
const CAMERA_HEIGHT = 3
const LOOK_AHEAD = 25
const ROAD_WIDTH = 10
const SIDE_OFFSET = 8

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parsePeriodMonths(period: string): number {
  const parts = period.split('–').map((s) => s.trim())
  const parseDate = (s: string): Date => {
    if (s === 'Present') return new Date()
    const [mon, year] = s.split(' ')
    return new Date(parseInt(year), MONTH_MAP[mon] ?? 0)
  }
  const start = parseDate(parts[0])
  const end = parseDate(parts[1] ?? 'Present')
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(months, 1)
}

function monthsToHeight(months: number): number {
  const MIN_HEIGHT = 4
  const MAX_HEIGHT = 16
  const t = Math.min(Math.max(months, 6), 48)
  return MIN_HEIGHT + ((t - 6) / (48 - 6)) * (MAX_HEIGHT - MIN_HEIGHT)
}

const THEME_COLORS = {
  dark: {
    background: '#1a1a1a',
    fog: '#1a1a1a',
  },
  light: {
    background: '#f5f5f5',
    fog: '#f5f5f5',
  },
}

interface SceneProps {
  scrollProgress: number
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  onReady?: () => void
}

export function Scene({ scrollProgress, experiences, activeExperienceId, theme, onReady }: SceneProps) {
  const { camera } = useThree()
  const smoothProgress = useRef(0)
  const smoothLookAt = useRef(new THREE.Vector3(0, 0, LOOK_AHEAD))
  const readyFired = useRef(false)
  const frameCount = useRef(0)
  const buildingsReady = useRef(false)

  // Pre-allocate reusable vectors (avoid GC pressure from per-frame allocations)
  const _targetLookAt = useRef(new THREE.Vector3())
  const _targetCameraPos = useRef(new THREE.Vector3())
  const _currentCameraPos = useRef(new THREE.Vector3())
  const _defaultLookAt = useRef(new THREE.Vector3())

  // Pre-compute experience data so we don't call find/findIndex/parse every frame
  const expLookup = useMemo(() => {
    const map = new Map<string, { exp: Experience; index: number; buildingHeight: number }>()
    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i]
      const months = parsePeriodMonths(exp.period)
      map.set(exp.id, { exp, index: i, buildingHeight: monthsToHeight(months) })
    }
    return map
  }, [experiences])

  const colors = THEME_COLORS[theme]

  const handleBuildingsReady = useCallback(() => {
    buildingsReady.current = true
  }, [])

  // Wait for buildings to finish + a few rendered frames before signaling ready
  useFrame(() => {
    if (!readyFired.current && buildingsReady.current) {
      frameCount.current++
      if (frameCount.current >= 5) {
        readyFired.current = true
        onReady?.()
      }
    }
  })

  // Cache vFov since it won't change
  const vFov = useMemo(() => THREE.MathUtils.degToRad(60), [])

  useFrame((_, delta) => {
    const activeData = activeExperienceId ? expLookup.get(activeExperienceId) : null

    const lerpSpeed = activeData ? 1.5 : 4
    smoothProgress.current += (scrollProgress - smoothProgress.current) * Math.min(delta * lerpSpeed, 1)
    const z = smoothProgress.current * ROAD_LENGTH

    if (activeData) {
      const { exp: activeExp, index: buildingIndex, buildingHeight } = activeData
      const buildingZ = activeExp.position * ROAD_LENGTH
      const side = buildingIndex % 2 === 0 ? 1 : -1
      const buildingX = side * (ROAD_WIDTH / 2 + SIDE_OFFSET)

      const LOGO_OFFSET = 1.5
      const LOGO_SIGN_HEIGHT_ESTIMATE = 2
      const totalHeight = buildingHeight + LOGO_OFFSET + LOGO_SIGN_HEIGHT_ESTIMATE
      const lookAtY = totalHeight / 2

      _targetLookAt.current.set(buildingX, lookAtY, buildingZ)
      smoothLookAt.current.lerp(_targetLookAt.current, Math.min(delta * 2, 1))

      const margin = 1.3
      const requiredDist = (totalHeight * margin) / (2 * Math.tan(vFov / 2))

      const cameraOffsetX = side * -(requiredDist * 0.55)
      const cameraOffsetZ = -(requiredDist * 0.85)
      const cameraOffsetY = lookAtY + requiredDist * 0.15
      _targetCameraPos.current.set(cameraOffsetX, cameraOffsetY, buildingZ + cameraOffsetZ)
      // Lerp from the camera's actual current position — NOT the road position.
      // Resetting to (0, CAMERA_HEIGHT, z) every frame would discard accumulated
      // lerp progress and fight with the still-moving smoothProgress, causing shaking.
      _currentCameraPos.current.copy(camera.position)
      _currentCameraPos.current.lerp(_targetCameraPos.current, Math.min(delta * 2, 1))
      camera.position.copy(_currentCameraPos.current)
    } else {
      camera.position.set(0, CAMERA_HEIGHT, z)
      _defaultLookAt.current.set(0, 0, z + LOOK_AHEAD)
      smoothLookAt.current.lerp(_defaultLookAt.current, Math.min(delta * 2, 1))
    }

    ;(camera as THREE.PerspectiveCamera).lookAt(smoothLookAt.current)

  })

  return (
    <>
      <color attach="background" args={[colors.background]} />
      <fogExp2 attach="fog" args={[colors.fog, 0.021]} />
      <ambientLight intensity={theme === 'light' ? 0.6 : 0.35} />
      <directionalLight
        position={[15, 30, 10]}
        intensity={theme === 'light' ? 1.8 : 1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={150}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />
      <directionalLight position={[-5, 10, -5]} intensity={theme === 'light' ? 0.3 : 0.15} />
      {/* Weak fill light that follows the camera */}
      <pointLight
        position={camera.position}
        intensity={theme === 'light' ? 0.4 : 0.25}
        distance={40}
        decay={2}
      />
      <Road length={ROAD_LENGTH} theme={theme} />
      <Buildings
        roadLength={ROAD_LENGTH}
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        onReady={handleBuildingsReady}
      />
      <EffectComposer multisampling={0} enableNormalPass>
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={10}
          radius={0.5}
          intensity={50}
          luminanceInfluence={0.3}
          worldDistanceThreshold={12}
          worldDistanceFalloff={3}
          worldProximityThreshold={0.8}
          worldProximityFalloff={0.5}
        />
        <Bloom
          intensity={0.4}
          luminanceThreshold={0.6}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
        <Vignette
          offset={0.35}
          darkness={0.55}
          blendFunction={BlendFunction.NORMAL}
        />
        <Noise
          blendFunction={BlendFunction.SOFT_LIGHT}
          opacity={0.25}
        />
      </EffectComposer>
    </>
  )
}
