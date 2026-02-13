import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { PerfPreset } from '../utils/devicePerf'
import { CAMERA_HEIGHT, LOOK_AHEAD, ROAD_LENGTH, ROAD_WIDTH, EXPERIENCE_SIDE_OFFSET } from './config'

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

interface SceneRigInput {
  scrollProgress: number
  activeExperienceId: string | null
  experiences: Experience[]
  perf: PerfPreset
  onReady?: () => void
}

export function useSceneRig({ scrollProgress, activeExperienceId, experiences, perf, onReady }: SceneRigInput) {
  const { camera, gl } = useThree()

  // Clamp DPR by perf tier
  useEffect(() => {
    const maxDpr = perf.dpr[1]
    const deviceDpr = window.devicePixelRatio || 1
    gl.setPixelRatio(Math.min(deviceDpr, maxDpr))
  }, [gl, perf.dpr])

  const smoothProgress = useRef(0)
  const smoothLookAt = useRef(new THREE.Vector3(0, 0, LOOK_AHEAD))
  const readyFired = useRef(false)
  const frameCount = useRef(0)
  const buildingsReady = useRef(false)

  // Pre-allocate reusable vectors
  const _targetLookAt = useRef(new THREE.Vector3())
  const _targetCameraPos = useRef(new THREE.Vector3())
  const _currentCameraPos = useRef(new THREE.Vector3())
  const _defaultLookAt = useRef(new THREE.Vector3())

  // Pre-compute experience data so we don't parse every frame
  const expLookup = useMemo(() => {
    const map = new Map<string, { exp: Experience; index: number; buildingHeight: number }>()
    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i]
      const months = parsePeriodMonths(exp.period)
      map.set(exp.id, { exp, index: i, buildingHeight: monthsToHeight(months) })
    }
    return map
  }, [experiences])

  const handleBuildingsReady = useCallback(() => {
    buildingsReady.current = true
  }, [])

  // Wait for buildings ready + a few frames before firing ready
  useFrame(() => {
    if (!readyFired.current && buildingsReady.current) {
      frameCount.current++
      if (frameCount.current >= 5) {
        readyFired.current = true
        onReady?.()
      }
    }
  })

  const vFov = useMemo(() => THREE.MathUtils.degToRad(95), [])

  useFrame((_, delta) => {
    const activeData = activeExperienceId ? expLookup.get(activeExperienceId) : null

    const lerpSpeed = activeData ? 1.5 : 4
    smoothProgress.current += (scrollProgress - smoothProgress.current) * Math.min(delta * lerpSpeed, 1)
    const z = smoothProgress.current * ROAD_LENGTH

    if (activeData) {
      const { exp: activeExp, index: buildingIndex, buildingHeight } = activeData
      const buildingZ = activeExp.position * ROAD_LENGTH
      const side = buildingIndex % 2 === 0 ? 1 : -1
      const buildingX = side * (ROAD_WIDTH / 2 + EXPERIENCE_SIDE_OFFSET)

      const LOGO_OFFSET = 6
      const LOGO_SIGN_HEIGHT_ESTIMATE = 3
      const totalHeight = buildingHeight + LOGO_OFFSET + LOGO_SIGN_HEIGHT_ESTIMATE
      const lookAtY = totalHeight / 2

      const LOOK_AT_SIDE_OFFSET = -6
      const lookAtX = buildingX + side * LOOK_AT_SIDE_OFFSET
      _targetLookAt.current.set(lookAtX, lookAtY, buildingZ)
      smoothLookAt.current.lerp(_targetLookAt.current, Math.min(delta * 2, 1))

      const margin = 0.7
      const requiredDist = (totalHeight * margin) / (2 * Math.tan(vFov / 2))

      const cameraOffsetX = side * -(requiredDist * 0.45)
      const cameraOffsetZ = -(requiredDist * 0.95)
      const cameraOffsetY = lookAtY + requiredDist * 0.09
      _targetCameraPos.current.set(cameraOffsetX, cameraOffsetY, buildingZ + cameraOffsetZ)
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

  return { handleBuildingsReady }
}
