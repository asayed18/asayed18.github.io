import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import { CAMERA_HEIGHT, LOOK_AHEAD, ROAD_LENGTH, ROAD_WIDTH, EXPERIENCE_SIDE_OFFSET } from './config'
import { parsePeriodMonths, monthsToHeight } from './period'
import { keepRendering, MAX_EASING_STEP } from './pacing'

interface SceneRigInput {
  /**
   * Scroll progress (0 to 1). A ref, not a prop: the camera reads it once per frame, so scrolling
   * does not re-render the React tree.
   */
  progressRef: MutableRefObject<number>
  activeExperienceId: string | null
  experiences: Experience[]
}

/** The camera counts as at rest once it is this close (world units) to where it is heading. */
const REST_DISTANCE = 0.01
const REST_DISTANCE_SQ = REST_DISTANCE * REST_DISTANCE

export function useSceneRig({ progressRef, activeExperienceId, experiences }: SceneRigInput) {
  const camera = useThree((state) => state.camera)

  const smoothProgress = useRef(0)
  const smoothLookAt = useRef(new THREE.Vector3(0, 0, LOOK_AHEAD))

  // Pre-allocate reusable vectors
  const _targetLookAt = useRef(new THREE.Vector3())
  const _targetCameraPos = useRef(new THREE.Vector3())
  const _currentCameraPos = useRef(new THREE.Vector3())

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

  const vFov = useMemo(() => THREE.MathUtils.degToRad(95), [])

  useFrame((state, frameDelta) => {
    const delta = Math.min(frameDelta, MAX_EASING_STEP)
    const scrollProgress = progressRef.current
    const activeData = activeExperienceId ? expLookup.get(activeExperienceId) : null

    const lerpSpeed = activeData ? 1.5 : 4
    smoothProgress.current += (scrollProgress - smoothProgress.current) * Math.min(delta * lerpSpeed, 1)
    const z = smoothProgress.current * ROAD_LENGTH

    let moving = Math.abs(scrollProgress - smoothProgress.current) * ROAD_LENGTH > REST_DISTANCE

    if (activeData) {
      const { exp: activeExp, index: buildingIndex, buildingHeight } = activeData
      const buildingZ = activeExp.position * ROAD_LENGTH
      const side = buildingIndex % 2 === 0 ? 1 : -1
      const buildingX = side * (ROAD_WIDTH / 2 + EXPERIENCE_SIDE_OFFSET)

      const LOGO_OFFSET = 6
      const LOGO_SIGN_HEIGHT_ESTIMATE = 5
      const totalHeight = buildingHeight + LOGO_OFFSET + LOGO_SIGN_HEIGHT_ESTIMATE
      const lookAtY = totalHeight / 2

      const LOOK_AT_SIDE_OFFSET = -6
      const lookAtX = buildingX + side * LOOK_AT_SIDE_OFFSET
      _targetLookAt.current.set(lookAtX, lookAtY, buildingZ)

      const margin = 0.7
      const requiredDist = (totalHeight * margin) / (2 * Math.tan(vFov / 2))

      const cameraOffsetX = side * -(requiredDist * 0.45)
      const cameraOffsetZ = -(requiredDist * 0.95)
      const cameraOffsetY = lookAtY + requiredDist * 0.09
      _targetCameraPos.current.set(cameraOffsetX, cameraOffsetY, buildingZ + cameraOffsetZ)
      _currentCameraPos.current.copy(camera.position)
      _currentCameraPos.current.lerp(_targetCameraPos.current, Math.min(delta * 2, 1))
      camera.position.copy(_currentCameraPos.current)

      if (camera.position.distanceToSquared(_targetCameraPos.current) > REST_DISTANCE_SQ) moving = true
    } else {
      camera.position.set(0, CAMERA_HEIGHT, z)
      _targetLookAt.current.set(0, 0, z + LOOK_AHEAD)
    }

    smoothLookAt.current.lerp(_targetLookAt.current, Math.min(delta * 2, 1))
    if (smoothLookAt.current.distanceToSquared(_targetLookAt.current) > REST_DISTANCE_SQ) moving = true

    camera.lookAt(smoothLookAt.current)

    // Ask for the next frame only while the camera is still travelling.
    if (moving) keepRendering(state)
  })
}
