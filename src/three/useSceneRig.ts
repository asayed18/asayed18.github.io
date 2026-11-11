import { useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import { LOOK_AHEAD } from './config'
import { parsePeriodMonths, monthsToHeight } from './period'
import { keepRendering, MAX_EASING_STEP } from './pacing'
import { ROAD_LENGTH, cruisePosition, experiencePose, experienceSide, roadFrame, type CameraPose } from './path'

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

/** Largest turn of the view towards the landmark on a portrait screen. */
const PORTRAIT_TURN = THREE.MathUtils.degToRad(14)
const UP = new THREE.Vector3(0, 1, 0)

export function useSceneRig({ progressRef, activeExperienceId, experiences }: SceneRigInput) {
  const camera = useThree((state) => state.camera)

  const smoothProgress = useRef(0)
  const smoothLookAt = useRef(roadFrame(LOOK_AHEAD).point.clone())

  const targetPos = useRef(new THREE.Vector3())
  const targetLook = useRef(new THREE.Vector3())
  const scratch = useRef(roadFrame(0))
  const pose = useRef<CameraPose>({ position: new THREE.Vector3(), lookAt: new THREE.Vector3() })

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

  useFrame((state, frameDelta) => {
    const delta = Math.min(frameDelta, MAX_EASING_STEP)
    const scrollProgress = progressRef.current
    const activeData = activeExperienceId ? expLookup.get(activeExperienceId) : null

    const lerpSpeed = activeData ? 1.5 : 4
    smoothProgress.current += (scrollProgress - smoothProgress.current) * Math.min(delta * lerpSpeed, 1)
    const distance = smoothProgress.current * ROAD_LENGTH

    let moving = Math.abs(scrollProgress - smoothProgress.current) * ROAD_LENGTH > REST_DISTANCE

    if (activeData) {
      experiencePose(activeData.exp.position * ROAD_LENGTH, activeData.index, activeData.buildingHeight, pose.current)
      targetPos.current.copy(pose.current.position)
      targetLook.current.copy(pose.current.lookAt)
      // A portrait screen sees too little to each side for the landmark beside the building:
      // turn the view part of the way towards it.
      const aspect = (camera as THREE.PerspectiveCamera).aspect ?? 1
      const turn = experienceSide(activeData.index) * THREE.MathUtils.clamp((1 - aspect) * PORTRAIT_TURN, 0, PORTRAIT_TURN)
      if (turn !== 0) {
        targetLook.current.sub(targetPos.current).applyAxisAngle(UP, turn).add(targetPos.current)
      }
    } else {
      cruisePosition(distance, targetPos.current)
      // Look down the road, along the curve.
      targetLook.current.copy(roadFrame(distance + LOOK_AHEAD, scratch.current).point)
    }

    // Glide in and out of a building's view instead of cutting: the camera eases towards its
    // target in both modes, faster while cruising so it keeps up with the scroll.
    camera.position.lerp(targetPos.current, Math.min(delta * (activeData ? 2 : 6), 1))
    if (camera.position.distanceToSquared(targetPos.current) > REST_DISTANCE_SQ) moving = true

    smoothLookAt.current.lerp(targetLook.current, Math.min(delta * (activeData ? 2 : 5), 1))
    if (smoothLookAt.current.distanceToSquared(targetLook.current) > REST_DISTANCE_SQ) moving = true

    camera.lookAt(smoothLookAt.current)

    // Ask for the next frame only while the camera is still travelling.
    if (moving) keepRendering(state)
  })
}
