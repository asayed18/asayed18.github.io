import type { RootState } from '@react-three/fiber'

/**
 * Frame pacing.
 *
 * The canvas renders on demand (`frameloop="demand"`) instead of at the display rate:
 *
 * - While something moves (camera easing, lights fading) the moving part calls `keepRendering`
 *   from its `useFrame` callback, and frames follow each other at the display rate.
 * - While only the ambient animation runs (cloud drift, the bobbing logo signs) a timer asks for
 *   AMBIENT_FPS frames per second. Both are slow enough to look the same at that rate.
 * - While the scene is hidden behind the hero blur, the portfolio or the About dialog, nothing
 *   asks for frames, and the GPU idles.
 */
export const AMBIENT_FPS = 30

/**
 * Longest time step fed to the easing code. The first frame after a quiet stretch arrives with
 * the whole pause as its delta, which would make every eased value jump straight to its target.
 */
export const MAX_EASING_STEP = 0.1

let continuous = false

/** Call from a `useFrame` callback while something is still moving. */
export function keepRendering(state: RootState): void {
  continuous = true
  state.invalidate()
}

/**
 * For the owner of the render loop, once per frame: whether this frame asked for the next one.
 * A frame that follows such a frame was paced by the display, so its duration measures the
 * frame rate. Any other frame was paced by a timer or an event.
 */
export function takeContinuous(): boolean {
  const value = continuous
  continuous = false
  return value
}
