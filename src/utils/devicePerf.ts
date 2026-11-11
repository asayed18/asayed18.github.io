/**
 * Device-aware performance presets.
 * Detects platform and GPU capability to pick appropriate quality settings.
 *
 * Append `?tier=low`, `?tier=medium` or `?tier=high` to the URL to force a preset when testing.
 */

export type PerfTier = 'low' | 'medium' | 'high'

export interface PerfPreset {
  tier: PerfTier
  /** Device pixel ratio range [min, max] */
  dpr: [number, number]
  /** Shadow map size for main directional light */
  shadowMapSize: number
  /** Enable shadow casting on active experience buildings */
  buildingShadows: boolean
  /** Enable bloom post-processing */
  enableBloom: boolean
  /** Enable ambient occlusion (N8AO) */
  enableSSAO: boolean
  /** Sphere segment count for celestial body */
  celestialSegments: number
  /** Enable shadows on the renderer */
  enableShadows: boolean | 'soft' | 'basic' | 'percentage' | 'variance'
}

const PRESETS: Record<PerfTier, PerfPreset> = {
  low: {
    tier: 'low',
    dpr: [1, 1],
    shadowMapSize: 256,
    buildingShadows: false,
    enableBloom: false,
    enableSSAO: false,
    celestialSegments: 8,
    enableShadows: false,
  },
  medium: {
    tier: 'medium',
    dpr: [1, 1.5],
    shadowMapSize: 512,
    buildingShadows: true,
    enableBloom: true,
    enableSSAO: true,
    celestialSegments: 24,
    enableShadows: 'soft',
  },
  high: {
    tier: 'high',
    dpr: [1, 2],
    shadowMapSize: 1024,
    buildingShadows: true,
    enableBloom: true,
    enableSSAO: true,
    celestialSegments: 32,
    enableShadows: 'soft',
  },
}

interface GpuProbe {
  /** False when the browser cannot create a WebGL context at all. */
  available: boolean
  /** Lower-cased renderer string, empty when the browser hides it. */
  renderer: string
}

let _gpu: GpuProbe | null = null

function probeGpu(): GpuProbe {
  if (_gpu) return _gpu
  let available = false
  let renderer = ''
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (gl) {
      available = true
      // Firefox reports the renderer through the standard parameter and deprecates the extension.
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      const value = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      renderer = String(value ?? '').toLowerCase()
      // Release the context so it does not count against the browser's context limit.
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  } catch {
    // Treated as "no WebGL".
  }
  _gpu = { available, renderer }
  return _gpu
}

/** Whether a WebGL context can be created. Without one the site shows its text version. */
export function isWebGLAvailable(): boolean {
  return probeGpu().available
}

// Software rasterisers (no GPU, or the GPU is blocklisted) and weak integrated or mobile chips.
// Intel reports "Intel(R) UHD Graphics 630", so the "(R)" has to be allowed for.
const LOW_GPU = /swiftshader|llvmpipe|softpipe|software|microsoft basic render|mali|powervr|intel(\(r\))? (hd|uhd)/
// Phones never match this (Adreno and Apple phone GPUs report other names), so every phone gets
// the low preset through the mobile branch below.
const HIGH_GPU = /nvidia|radeon|apple m\d/

function detectTier(): PerfTier {
  const ua = navigator.userAgent.toLowerCase()
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua)

  const { renderer } = probeGpu()
  let gpuTier: 'low' | 'mid' | 'high' = 'mid'
  if (LOW_GPU.test(renderer)) gpuTier = 'low'
  else if (HIGH_GPU.test(renderer)) gpuTier = 'high'

  // Check memory (if available)
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8
  const lowMemory = memory <= 4

  // Check hardware concurrency
  const cores = navigator.hardwareConcurrency ?? 4
  const lowCores = cores <= 4

  // Decision matrix
  if (isMobile) {
    if (gpuTier === 'low' || lowMemory) return 'low'
    if (gpuTier === 'high' && !lowMemory) return 'medium'
    return 'low' // default mobile to low
  }

  // Desktop / tablet
  if (gpuTier === 'low' || (lowMemory && lowCores)) return 'low'
  if (gpuTier === 'high' && !lowMemory) return 'high'
  return 'medium'
}

function forcedTier(): PerfTier | null {
  const value = new URLSearchParams(window.location.search).get('tier')
  return value === 'low' || value === 'medium' || value === 'high' ? value : null
}

let _cachedPreset: PerfPreset | null = null

export function getPerf(): PerfPreset {
  if (_cachedPreset) return _cachedPreset

  const tier = forcedTier() ?? detectTier()
  _cachedPreset = PRESETS[tier]

  if (import.meta.env.DEV) {
    console.info(`[perf] tier: ${tier} (renderer: ${probeGpu().renderer || 'unknown'})`)
  }
  return _cachedPreset
}
