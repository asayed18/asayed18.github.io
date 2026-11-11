import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Vector2, type WebGLRenderer } from 'three'
import {
  EffectComposer,
  N8AO,
  Vignette,
  Bloom,
  SMAA,
  ToneMapping,
  HueSaturation,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type EffectComposer as EffectComposerImpl } from 'postprocessing'
import type { PerfPreset } from '../utils/devicePerf'
import type { Theme } from '../theme'
import { takeContinuous } from './pacing'

interface PostProcessingProps {
  theme: Theme
  perf: PerfPreset
  /** Called once, after the first frames of the scene have been drawn. */
  onReady?: () => void
  /** Called when the frame rate stays low, so the caller can lower the render resolution. */
  onSlowFrames?: () => void
}

function isContextValid(gl: WebGLRenderer | null | undefined): boolean {
  if (!gl) return false
  const ctx = gl.getContext()
  if (!ctx) return false
  try {
    return !ctx.isContextLost()
  } catch {
    return false
  }
}

/** Waits for N frames inside the render loop before allowing composer mount (avoids addPass when getContext() is null). */
function useComposerReady(gl: WebGLRenderer | null | undefined): boolean {
  const [ready, setReady] = useState(false)
  const frameCount = useRef(0)

  useFrame((state) => {
    if (ready) return
    // The canvas renders on demand, so ask for the frames this wait needs.
    state.invalidate()
    if (!isContextValid(gl)) {
      frameCount.current = 0
      return
    }
    frameCount.current += 1
    if (frameCount.current >= 2) {
      setReady(true)
    }
  })

  useEffect(() => {
    if (!isContextValid(gl)) setReady(false)
  }, [gl])

  return ready
}

/** If the driver never reports the shaders as ready, stop waiting and compile them the blocking way. */
const COMPILE_TIMEOUT_MS = 10_000
/** Frames drawn before the scene is reported as ready. */
const READY_AFTER_FRAMES = 3

// Adaptive resolution: frames slower than SLOW_FRAME_MS on average, measured over
// SAMPLE_FRAMES frames, two windows in a row, ask the caller for a lower pixel ratio.
// Only frames that directly follow another frame count (see pacing.ts): the others were paced
// by a timer or an event, not by how fast the GPU can draw.
const SAMPLE_FRAMES = 90
const SLOW_FRAME_MS = 25 // below 40 fps
/** Longer gaps are a tab switch or a one-off stall, not the steady frame rate. */
const IGNORED_GAP_MS = 250

/**
 * Owns the render loop: draws the scene through the post-processing chain and decides when the
 * first frame may be drawn.
 */
export const PostProcessing = memo(function PostProcessing({ theme, perf, onReady, onSlowFrames }: PostProcessingProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const dpr = useThree((s) => s.viewport.dpr)
  const invalidate = useThree((s) => s.invalidate)
  const getState = useThree((s) => s.get)
  const composerRef = useRef<EffectComposerImpl>(null)
  const [contextLost, setContextLost] = useState(false)
  const [compiled, setCompiled] = useState(false)
  const ready = useComposerReady(gl)

  // Take over rendering from the first frame. Without this, React Three Fiber draws the scene
  // straight to the canvas until the composer mounts two frames later. Materials are compiled
  // per render target, so those two frames compiled every shader of the scene a first time
  // (tone-mapped, sRGB output), only for the composer to compile all of them again.
  useFrame(() => {}, 1)

  useEffect(() => {
    const canvas = gl.domElement
    const onContextLost = () => {
      setContextLost(true)
      setCompiled(false)
    }
    // three.js rebuilds its GL state when the context comes back. Mount the composer again.
    const onContextRestored = () => setContextLost(false)
    canvas.addEventListener('webglcontextlost', onContextLost)
    canvas.addEventListener('webglcontextrestored', onContextRestored)
    return () => {
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
    }
  }, [gl])

  const mounted = !contextLost && ready && isContextValid(gl)

  // Compile every material before the first frame, without blocking the main thread: the browser
  // builds the shaders in the background (KHR_parallel_shader_compile) while the page stays
  // responsive. Where the extension is missing the promise resolves at once and three.js
  // compiles on first use, as before.
  useEffect(() => {
    if (!mounted || compiled) return
    const composer = composerRef.current
    if (!composer) return

    let cancelled = false
    const done = () => {
      if (!cancelled) setCompiled(true)
    }
    const timeout = window.setTimeout(done, COMPILE_TIMEOUT_MS)

    // The programs depend on the render target, so compile against the composer's buffer.
    const previousTarget = gl.getRenderTarget()
    gl.setRenderTarget(composer.inputBuffer)
    const compilation = gl.compileAsync(scene, camera)
    gl.setRenderTarget(previousTarget)
    compilation.then(done, done)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [mounted, compiled, gl, scene, camera])

  // The composer sizes its buffers from the drawing buffer but only listens to canvas size
  // changes, so tell it when the pixel ratio changes.
  useEffect(() => {
    const { width, height } = getState().size
    composerRef.current?.setSize(width, height)
    invalidate()
  }, [dpr, getState, invalidate])

  // The canvas renders on demand, and switching the composer on changes nothing three.js can
  // see, so ask for the first frame explicitly.
  useEffect(() => {
    if (compiled) invalidate()
  }, [compiled, invalidate])

  const readyFired = useRef(false)
  const drawnFrames = useRef(0)
  const followsFrame = useRef(false)
  const sample = useRef({ frames: 0, ms: 0, slowWindows: 0 })

  // Priority 2: runs after the composer has drawn the frame (priority 1).
  useFrame((state, delta) => {
    const displayPaced = followsFrame.current
    followsFrame.current = takeContinuous()

    if (!mounted || !compiled) return

    if (!readyFired.current) {
      drawnFrames.current += 1
      if (drawnFrames.current >= READY_AFTER_FRAMES) {
        readyFired.current = true
        onReady?.()
      } else {
        state.invalidate()
      }
      return
    }

    if (!onSlowFrames || !displayPaced) return
    const ms = delta * 1000
    if (ms > IGNORED_GAP_MS) return
    const s = sample.current
    s.frames += 1
    s.ms += ms
    if (s.frames < SAMPLE_FRAMES) return
    const slow = s.ms / s.frames > SLOW_FRAME_MS
    s.frames = 0
    s.ms = 0
    s.slowWindows = slow ? s.slowWindows + 1 : 0
    if (s.slowWindows >= 2) {
      s.slowWindows = 0
      onSlowFrames()
    }
  }, 2)

  // A stable array: the composer rebuilds its passes whenever its children change identity.
  //
  // The chain, as a camera would see it:
  // - N8AO: ambient occlusion in the corners, under the cornices and where the blocks meet the
  //   street (half resolution on mid-range GPUs).
  // - Bloom on the lit windows, lamps and the moon; filmic tone mapping rolls off the highlights
  //   at night instead of clipping them. Saturation is pinned to zero: the city stays black and
  //   white whatever a texture or a light brings in.
  // - SMAA on the tone-mapped image, then a trace of lens fringing on fast GPUs, vignetting and
  //   film grain last so the antialiasing never smears the grain.
  const effects = useMemo(() => {
    const isLight = theme === 'light'
    const list: JSX.Element[] = []
    if (perf.enableSSAO) {
      list.push(
        <N8AO
          key="ao"
          aoRadius={2.6}
          distanceFalloff={1.1}
          intensity={isLight ? 2.4 : 1.6}
          quality={perf.tier === 'high' ? 'medium' : 'low'}
          halfRes={perf.tier !== 'high'}
          depthAwareUpsampling
        />
      )
    }
    if (perf.enableBloom) {
      list.push(
        <Bloom
          key="bloom"
          intensity={isLight ? 0.25 : 0.75}
          luminanceThreshold={isLight ? 0.75 : 0.4}
          luminanceSmoothing={0.35}
          mipmapBlur
          radius={0.75}
        />
      )
    }
    list.push(<HueSaturation key="bw" saturation={-1} />)
    if (!isLight) list.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />)
    list.push(<Vignette key="vignette" offset={0.3} darkness={isLight ? 0.38 : 0.55} blendFunction={BlendFunction.NORMAL} />)
    if (perf.tier !== 'low') list.push(<SMAA key="smaa" />)
    if (perf.tier === 'high') {
      list.push(
        <ChromaticAberration
          key="fringe"
          offset={new Vector2(0.0005, 0.0004)}
          radialModulation
          modulationOffset={0.35}
        />
      )
    }
    if (perf.tier !== 'low') {
      list.push(
        <Noise key="grain" blendFunction={BlendFunction.SOFT_LIGHT} opacity={isLight ? 0.08 : 0.1} />
      )
    }
    return list
  }, [perf, theme])

  if (!mounted) return null

  return (
    <EffectComposer
      ref={composerRef}
      enabled={compiled}
      multisampling={0}
    >
      {effects}
    </EffectComposer>
  )
})
