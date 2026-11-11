import { memo, useCallback, useEffect, useState, type MutableRefObject, type RefObject } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { Scene } from './Scene'
import { AMBIENT_FPS } from './pacing'

interface Experience3DProps {
  /** Scroll progress (0 to 1), read by the camera once per frame. */
  progressRef: MutableRefObject<number>
  /** The element whose scrolling drives the journey. */
  scrollRef: RefObject<HTMLElement | null>
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
  /**
   * Whether the scene can be seen. False while it sits behind the landing blur, the portfolio or
   * the About dialog: its ambient animation is then not drawn.
   */
  ambient: boolean
  onReady: () => void
}

/** Lowest pixel ratio the adaptive resolution falls back to. */
const MIN_PIXEL_RATIO = 0.75

/** Decides when frames are drawn. See pacing.ts. */
function FramePacer({ scrollRef, ambient }: Pick<Experience3DProps, 'scrollRef' | 'ambient'>) {
  const invalidate = useThree((state) => state.invalidate)

  // Scrolling moves the camera: draw at once, the camera then keeps frames coming while it eases.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const wake = () => invalidate()
    el.addEventListener('scroll', wake, { passive: true })
    return () => el.removeEventListener('scroll', wake)
  }, [scrollRef, invalidate])

  // Cloud drift and the bobbing logo signs.
  useEffect(() => {
    if (!ambient) return
    invalidate()
    const timer = window.setInterval(() => invalidate(), 1000 / AMBIENT_FPS)
    return () => window.clearInterval(timer)
  }, [ambient, invalidate])

  return null
}

/**
 * The WebGL part of the site. Loaded as its own chunk, so three.js does not hold up the first
 * paint of the page around it.
 */
function Experience3D({
  progressRef,
  scrollRef,
  experiences,
  activeExperienceId,
  theme,
  perf,
  ambient,
  onReady,
}: Experience3DProps) {
  // Adaptive resolution: starts at the preset's pixel ratio and only ever steps down, when the
  // frame rate stays low on this device.
  const [maxPixelRatio, setMaxPixelRatio] = useState(() =>
    Math.min(Math.max(window.devicePixelRatio || 1, perf.dpr[0]), perf.dpr[1])
  )
  const lowerPixelRatio = useCallback(() => {
    setMaxPixelRatio((current) => (current > 1 ? Math.max(1, current - 0.5) : MIN_PIXEL_RATIO))
  }, [])

  return (
    <Canvas
      frameloop="demand"
      gl={{
        // The scene is drawn into the post-processing buffers, so multisampling the canvas itself
        // would only cost memory.
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
        // Force WebGL context: don't fail when the browser would report a performance caveat (e.g. software renderer)
        failIfMajorPerformanceCaveat: false,
        stencil: false,
      }}
      shadows={perf.enableShadows}
      camera={{ position: [0, 3, 0], fov: 80 }}
      dpr={[Math.min(perf.dpr[0], maxPixelRatio), maxPixelRatio]}
      onCreated={({ gl }) => {
        // Reading back the compile status of every shader forces the driver to finish compiling
        // on the spot. Only worth it while developing.
        gl.debug.checkShaderErrors = import.meta.env.DEV
      }}
    >
      <FramePacer scrollRef={scrollRef} ambient={ambient} />
      <Scene
        progressRef={progressRef}
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        perf={perf}
        onReady={onReady}
        onSlowFrames={lowerPixelRatio}
      />
    </Canvas>
  )
}

export default memo(Experience3D)
