import { useEffect, useRef, type DependencyList } from 'react'
import { useThree } from '@react-three/fiber'
import type { DirectionalLight, PointLight } from 'three'

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
