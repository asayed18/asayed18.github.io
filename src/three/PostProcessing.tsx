import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, Uniform, Vector2, type Mesh, type WebGLRenderer } from 'three'
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
  DepthOfField,
  BrightnessContrast,
  GodRays,
  wrapEffect,
} from '@react-three/postprocessing'
import {
  BlendFunction,
  Effect,
  ToneMappingMode,
  type DepthOfFieldEffect,
  type EffectComposer as EffectComposerImpl,
} from 'postprocessing'
import { cameraFocus } from './useSceneRig'
import type { PerfPreset } from '../utils/devicePerf'
import type { Theme } from '../theme'
import { takeContinuous } from './pacing'

/**
 * Split toning, as colourists grade city footage: shadows pushed towards a cool blue-teal and
 * highlights towards warm amber, weighted by luminance. In daylight it is a hint; at night it
 * separates the sodium-lit windows and lamps from the moonlit walls.
 */
class SplitToneEffect extends Effect {
  constructor({ shadows = '#6f86a8', highlights = '#e8c39a', strength = 0.3 } = {}) {
    super(
      'SplitToneEffect',
      /* glsl */ `
uniform vec3 uShadows;
uniform vec3 uHighlights;
uniform float uStrength;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float t = smoothstep(0.05, 0.75, l);
  vec3 tint = mix(uShadows, uHighlights, t);
  // Tints are normalised to their own luminance, so grading shifts hue, not brightness.
  tint /= max(dot(tint, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  outputColor = vec4(mix(c, c * tint, uStrength), inputColor.a);
}
`,
      {
        uniforms: new Map<string, Uniform>([
          ['uShadows', new Uniform(new Color(shadows))],
          ['uHighlights', new Uniform(new Color(highlights))],
          ['uStrength', new Uniform(strength)],
        ]),
      }
    )
  }
}
const SplitTone = wrapEffect(SplitToneEffect)

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

  // The depth of field follows what the camera looks at (see useSceneRig): the building in focus
  // is sharp and the city behind it softens; on the road the sharp zone is much deeper.
  const dofRef = useRef<DepthOfFieldEffect>(null)

  // Light shafts: a small disc where the sun (or the moon) stands, kept at the same fixed offset
  // from the camera as the visible body in lighting.tsx. The effect streaks its light through the
  // haze wherever the buildings leave it a gap.
  const [rayDisc, setRayDisc] = useState<Mesh | null>(null)
  const isLightTheme = theme === 'light'
  useFrame((state) => {
    if (!rayDisc) return
    const cam = state.camera.position
    rayDisc.position.set(cam.x, cam.y + (isLightTheme ? 30 : 16), cam.z + 55)
    rayDisc.lookAt(cam)
  })
  useFrame((state, delta) => {
    const dof = dofRef.current
    if (!dof) return
    const k = Math.min(delta * 3, 1)
    dof.cocMaterial.focusDistance = state.camera.position.distanceTo(cameraFocus.target)
    dof.cocMaterial.focusRange += (cameraFocus.range - dof.cocMaterial.focusRange) * k
  })

  // A stable array: the composer rebuilds its passes whenever its children change identity.
  //
  // The chain, as a camera would see it:
  // - N8AO: ambient occlusion in the corners, under the cornices and where the blocks meet the
  //   street (half resolution on mid-range GPUs).
  // - Depth of field focused on what the camera looks at, with round bokeh on the lit windows.
  // - Bloom on the lit windows, lamps, sun and moon; filmic tone mapping at night.
  // - Grading: colours held back a little and a touch more contrast, for a muted film look.
  // - SMAA on the tone-mapped image, then lens fringing towards the corners, vignetting and film
  //   grain last so the antialiasing never smears the grain.
  const effects = useMemo(() => {
    const isLight = theme === 'light'
    const list: JSX.Element[] = []
    if (perf.enableSSAO) {
      list.push(
        <N8AO
          key="ao"
          aoRadius={3}
          distanceFalloff={1.2}
          intensity={isLight ? 3 : 2}
          quality={perf.tier === 'high' ? 'medium' : 'low'}
          halfRes={perf.tier !== 'high'}
          depthAwareUpsampling
        />
      )
    }
    if (perf.tier !== 'low') {
      list.push(
        <DepthOfField
          key="dof"
          ref={dofRef}
          focusDistance={20}
          focusRange={cameraFocus.range}
          bokehScale={perf.tier === 'high' ? 2.2 : 1.6}
          resolutionScale={0.5}
        />
      )
    }
    if (perf.tier !== 'low' && rayDisc) {
      list.push(
        <GodRays
          key="rays"
          sun={rayDisc}
          samples={perf.tier === 'high' ? 48 : 32}
          density={0.97}
          decay={0.94}
          weight={isLight ? 0.45 : 0.35}
          exposure={isLight ? 0.5 : 0.4}
          clampMax={1}
          blur
          resolutionScale={0.5}
        />
      )
    }
    if (perf.enableBloom) {
      list.push(
        <Bloom
          key="bloom"
          intensity={isLight ? 0.45 : 0.8}
          luminanceThreshold={isLight ? 0.72 : 0.62}
          luminanceSmoothing={0.4}
          mipmapBlur
          radius={0.8}
        />
      )
    }
    list.push(
      <SplitTone
        key="split"
        shadows={isLight ? '#7d8ea6' : '#4f6f9a'}
        highlights={isLight ? '#efd2ae' : '#f0b878'}
        strength={isLight ? 0.22 : 0.42}
      />
    )
    if (!isLight) list.push(<ToneMapping key="tone" mode={ToneMappingMode.ACES_FILMIC} />)
    list.push(<HueSaturation key="grade" saturation={-0.12} />)
    list.push(<BrightnessContrast key="contrast" brightness={isLight ? 0 : 0.02} contrast={isLight ? 0.08 : 0.12} />)
    if (perf.tier !== 'low') list.push(<SMAA key="smaa" />)
    if (perf.tier !== 'low') {
      list.push(
        <ChromaticAberration
          key="fringe"
          offset={new Vector2(0.0012, 0.0009)}
          radialModulation
          modulationOffset={0.25}
        />
      )
    }
    list.push(<Vignette
        key="vignette"
        offset={isLight ? 0.25 : 0.32}
        darkness={isLight ? 0.5 : 0.92}
        blendFunction={BlendFunction.NORMAL}
      />)
    if (perf.tier !== 'low') {
      list.push(<Noise key="grain" blendFunction={BlendFunction.OVERLAY} opacity={isLight ? 0.06 : 0.07} />)
    }
    return list
  }, [perf, theme, rayDisc])

  if (!mounted) return null

  return (
    <>
      {perf.tier !== 'low' && (
        <mesh ref={setRayDisc} frustumCulled={false}>
          <circleGeometry args={[isLightTheme ? 3.2 : 2.6, 24]} />
          <meshBasicMaterial
            color={isLightTheme ? '#fff1d6' : '#c9d6f0'}
            transparent
            opacity={0.9}
            depthWrite={false}
            fog={false}
          />
        </mesh>
      )}
      <EffectComposer ref={composerRef} enabled={compiled} multisampling={0}>
        {effects}
      </EffectComposer>
    </>
  )
})
