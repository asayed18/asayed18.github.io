import { useEffect, useRef, type DependencyList } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector3, type DirectionalLight, type PointLight } from 'three'

type ShadowLight = DirectionalLight | PointLight

/**
 * Bakes the shadow map of a light whose casters do not move.
 *
 * By default three.js re-renders every shadow map on every frame, and a point light needs six
 * passes over the scene. The buildings are static, so the map is rendered once and again only
 * when `deps` change (for example when the light moves with the theme) or after the WebGL context
 * is restored.
 */
export function useStaticShadow<T extends ShadowLight>(deps: DependencyList = []) {
  const ref = useRef<T>(null)
  const gl = useThree((state) => state.gl)

  useEffect(() => {
    const light = ref.current
    if (!light) return
    light.shadow.autoUpdate = false
    light.shadow.needsUpdate = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const canvas = gl.domElement
    const rebake = () => {
      if (ref.current) ref.current.shadow.needsUpdate = true
    }
    canvas.addEventListener('webglcontextrestored', rebake)
    return () => canvas.removeEventListener('webglcontextrestored', rebake)
  }, [gl])

  return ref
}

/** Spacing of the points the moving shadow is re-centred on, in world units. */
const FOLLOW_STEP = 10
/** How far ahead of the camera the shadowed area is centred. */
const FOLLOW_AHEAD = 22

/**
 * A directional light whose shadow follows the camera along the road.
 *
 * The shadow map only covers a box around the camera, which keeps it sharp. The buildings never
 * move, so the map is rendered again only when the camera has travelled into a new cell of
 * FOLLOW_STEP units, not on every frame.
 */
export function useFollowShadow(offset: { x: number; y: number; z: number }, deps: DependencyList = []) {
  const ref = useRef<DirectionalLight>(null)
  const gl = useThree((state) => state.gl)
  const focus = useRef({ x: NaN, z: NaN })
  const forward = useRef(new Vector3())

  useEffect(() => {
    focus.current = { x: NaN, z: NaN }
    if (ref.current) ref.current.shadow.autoUpdate = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    const canvas = gl.domElement
    const rebake = () => (focus.current = { x: NaN, z: NaN })
    canvas.addEventListener('webglcontextrestored', rebake)
    return () => canvas.removeEventListener('webglcontextrestored', rebake)
  }, [gl])

  useFrame((state) => {
    const light = ref.current
    if (!light) return
    const cam = state.camera
    cam.getWorldDirection(forward.current)
    forward.current.y = 0
    if (forward.current.lengthSq() > 1e-6) forward.current.normalize()
    const x = Math.round((cam.position.x + forward.current.x * FOLLOW_AHEAD) / FOLLOW_STEP) * FOLLOW_STEP
    const z = Math.round((cam.position.z + forward.current.z * FOLLOW_AHEAD) / FOLLOW_STEP) * FOLLOW_STEP
    if (x === focus.current.x && z === focus.current.z) return
    focus.current = { x, z }
    light.shadow.autoUpdate = false
    light.position.set(x + offset.x, offset.y, z + offset.z)
    light.target.position.set(x, 0, z)
    light.target.updateMatrixWorld()
    light.shadow.needsUpdate = true
  })

  return ref
}
