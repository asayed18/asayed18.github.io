import * as THREE from 'three'
import { CAMERA_HEIGHT, ROAD_WIDTH, EXPERIENCE_SIDE_OFFSET } from './config'

/**
 * The road: one smooth curve through the city, sweeping left and right like a real avenue.
 * Everything along it (camera, buildings, lamps, markings) is placed by distance along the curve
 * and by the road's local frame at that distance.
 */
const CONTROL_POINTS: [number, number][] = [
  [0, -20],
  [0, 0],
  [-4, 40],
  [-26, 82],
  [-30, 120],
  [-10, 158],
  [22, 190],
  [34, 228],
  [22, 266],
  [6, 300],
  [0, 330],
]

const curve = new THREE.CatmullRomCurve3(
  CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  false,
  'centripetal'
)
curve.arcLengthDivisions = 3000

/** Arc length of the part of the curve the journey uses (from z = 0 on). */
const START = (() => {
  // Distance along the curve of the second control point, where the journey starts.
  const lengths = curve.getLengths(3000)
  const total = lengths[lengths.length - 1]
  const segment = 1 / (CONTROL_POINTS.length - 1)
  return lengths[Math.round(segment * 3000)] / total
})()
const END = 1 - (1 - START) * 0.12

const TOTAL = curve.getLength()
/** Length of the journey along the road, in world units. */
export const ROAD_LENGTH = TOTAL * (END - START)

/** Road length before the journey starts and after it ends (curves continue into the fog). */
export const ROAD_LEAD_IN = TOTAL * START
export const ROAD_LEAD_OUT = TOTAL * (1 - END)

/** Point of the curve at `distance` along the journey (may be negative or past the end). */
function u(distance: number): number {
  return THREE.MathUtils.clamp((ROAD_LEAD_IN + distance) / TOTAL, 0, 1)
}

export interface RoadFrame {
  /** Centre of the road. */
  point: THREE.Vector3
  /** Direction of travel. */
  tangent: THREE.Vector3
  /** Horizontal unit vector to the left of the direction of travel (+x at the start). */
  left: THREE.Vector3
  /** Rotation around y that turns local +z into the direction of travel. */
  yaw: number
}

export function roadFrame(distance: number, out?: RoadFrame): RoadFrame {
  const frame = out ?? { point: new THREE.Vector3(), tangent: new THREE.Vector3(), left: new THREE.Vector3(), yaw: 0 }
  const t = u(distance)
  curve.getPointAt(t, frame.point)
  curve.getTangentAt(t, frame.tangent)
  frame.tangent.y = 0
  frame.tangent.normalize()
  frame.left.set(frame.tangent.z, 0, -frame.tangent.x)
  frame.yaw = Math.atan2(frame.tangent.x, frame.tangent.z)
  return frame
}

/** Samples of the road centre line every `step` units, from before the start to past the end. */
export function roadSamples(step: number, from = -ROAD_LEAD_IN, to = ROAD_LENGTH + ROAD_LEAD_OUT): RoadFrame[] {
  const out: RoadFrame[] = []
  for (let d = from; d <= to + 1e-6; d += step) out.push(roadFrame(d))
  return out
}

/** Lateral distance of an experience building's centre from the road centre. */
export const EXPERIENCE_LATERAL = ROAD_WIDTH / 2 + 3

/** Side of the road an experience building stands on: +1 left, -1 right (alternating). */
export const experienceSide = (index: number) => (index % 2 === 0 ? 1 : -1)

/** Height of the sign above an experience building's roof, as framed by the camera. */
const LOGO_OFFSET = 6
const LOGO_SIGN_HEIGHT_ESTIMATE = 5
/** Vertical field of view used to frame a building. */
const FRAMING_FOV = THREE.MathUtils.degToRad(95)

export interface CameraPose {
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

/** Where the camera stands while an experience building is in focus. */
export function experiencePose(distance: number, index: number, buildingHeight: number, out?: CameraPose): CameraPose {
  const pose = out ?? { position: new THREE.Vector3(), lookAt: new THREE.Vector3() }
  const f = roadFrame(distance, scratchFrame)
  const side = experienceSide(index)
  const totalHeight = buildingHeight + LOGO_OFFSET + LOGO_SIGN_HEIGHT_ESTIMATE
  const lookAtY = totalHeight / 2
  const margin = 0.7
  const dist = (totalHeight * margin) / (2 * Math.tan(FRAMING_FOV / 2))

  // Look at a point a little towards the road from the building's centre.
  pose.lookAt
    .copy(f.point)
    .addScaledVector(f.left, side * (ROAD_WIDTH / 2 + EXPERIENCE_SIDE_OFFSET - 6))
    .setY(lookAtY)
  // Stand across the road, a little back along it.
  pose.position
    .copy(f.point)
    .addScaledVector(f.left, -side * dist * 0.45)
    .addScaledVector(f.tangent, -dist * 0.95)
    .setY(lookAtY + dist * 0.09)
  return pose
}

const scratchFrame: RoadFrame = { point: new THREE.Vector3(), tangent: new THREE.Vector3(), left: new THREE.Vector3(), yaw: 0 }

/** Camera position while cruising along the road. */
export function cruisePosition(distance: number, out: THREE.Vector3): THREE.Vector3 {
  roadFrame(distance, scratchFrame)
  return out.copy(scratchFrame.point).setY(CAMERA_HEIGHT)
}
