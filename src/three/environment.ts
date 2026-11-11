import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/** One environment per renderer, shared by every material that reflects it. */
const cache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>()

/**
 * A soft studio environment, generated on the GPU (nothing to download). Glass and damp asphalt
 * reflect it, which is most of what makes them read as glass and asphalt. It is assigned to those
 * materials only, not to the whole scene, so the night stays dark.
 */
export function useCityEnvironment(): THREE.Texture {
  const gl = useThree((state) => state.gl)
  let texture = cache.get(gl)
  if (!texture) {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment(gl)
    texture = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    cache.set(gl, texture)
  }
  return texture
}
