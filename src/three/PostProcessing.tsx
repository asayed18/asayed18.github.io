import { useEffect, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import type { WebGLRenderer } from 'three'
import { EffectComposer, SSAO, Vignette, Bloom } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import type { PerfPreset } from '../utils/devicePerf'
import type { Theme } from '../App'

interface PostProcessingProps {
  theme: Theme
  perf: PerfPreset
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

  useFrame(() => {
    if (ready) return
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

export function PostProcessing({ theme, perf }: PostProcessingProps) {
  const gl = useThree((s) => s.gl)
  const [contextLost, setContextLost] = useState(false)
  const ready = useComposerReady(gl)

  useEffect(() => {
    if (!gl) return
    const canvas = gl.domElement
    const onContextLost = () => setContextLost(true)
    canvas.addEventListener('webglcontextlost', onContextLost)
    return () => canvas.removeEventListener('webglcontextlost', onContextLost)
  }, [gl])

  if (contextLost || !ready || !isContextValid(gl)) {
    return <></>
  }

  return (
    <EffectComposer
      multisampling={0}
      enableNormalPass={perf.enableSSAO}
      resolutionScale={perf.tier === 'low' ? 0.75 : 1}
    >
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={perf.enableSSAO ? perf.ssaoSamples : 0}
        radius={0.9}
        intensity={perf.enableSSAO ? 40 : 0}
        luminanceInfluence={0.9}
        worldDistanceThreshold={12}
        worldDistanceFalloff={3}
        worldProximityThreshold={0.8}
        worldProximityFalloff={0.2}
      />
      <Bloom
        intensity={perf.enableBloom ? (theme === 'light' ? 0.2 : 0.9) : 0}
        luminanceThreshold={theme === 'light' ? 0.6 : 0.35}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette
        offset={theme === 'light' ? 0.4 : 0.35}
        darkness={theme === 'light' ? 0.45 : 0.5}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
