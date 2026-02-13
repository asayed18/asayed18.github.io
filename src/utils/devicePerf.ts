/**
 * Device-aware performance presets.
 * Detects platform and GPU capability to pick appropriate quality settings.
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
  /** SSAO sample count */
  ssaoSamples: number
  /** Enable bloom post-processing */
  enableBloom: boolean
  /** Enable SSAO post-processing */
  enableSSAO: boolean
  /** Background building count per side per row */
  buildingCount: number
  /** Sphere segment count for celestial body */
  celestialSegments: number
  /** Enable shadows on the renderer */
  enableShadows: boolean | "soft" | "basic" | "percentage" | "variance"
  /** Antialias */
  antialias: boolean
  /** Canvas performance.min (adaptive DPR) */
  perfMin: number
  /** Enable screen-space reflections (SSR) */
  enableSSR?: boolean
}

const LOW: PerfPreset = {
  tier: 'low',
  dpr: [1, 1],
  shadowMapSize: 256,
  buildingShadows: false,
  ssaoSamples: 0,
  enableBloom: false,
  enableSSAO: false,
  buildingCount: 50,
  celestialSegments: 8,
  enableShadows: false,
  antialias: false,
  perfMin: 0.3,
  enableSSR: false,
}

const MEDIUM: PerfPreset = {
  tier: 'medium',
  dpr: [1, 1.5],
  shadowMapSize: 512,
  buildingShadows: true,
  ssaoSamples: 32,
  enableBloom: true,
  enableSSAO: true,
  buildingCount: 50,
  celestialSegments: 24,
  enableShadows: 'soft',
  antialias: true,
  perfMin: 0.5,
  enableSSR: false,
}

const HIGH: PerfPreset = {
  tier: 'high',
  dpr: [1, 2],
  shadowMapSize: 1024,
  buildingShadows: true,
  ssaoSamples: 64,
  enableBloom: true,
  enableSSAO: true,
  buildingCount: 150,
  celestialSegments: 32,
  enableShadows: "soft",
  antialias: true,
  perfMin: 0.5,
  enableSSR: true,
}

function detectTier(): PerfTier {
  const ua = navigator.userAgent.toLowerCase()

  // Check for mobile
  const isMobile = /android|iphone|ipad|ipod|mobile/.test(ua)

  // Check GPU via WebGL (release context after to avoid "too many contexts")
  let gpuTier: 'low' | 'mid' | 'high' = 'mid'
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info')
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase()
        if (/mali|adreno 3|adreno 4|adreno 5|powervr|intel hd|intel uhd/.test(renderer)) {
          gpuTier = 'low'
        }
        if (/nvidia|radeon|apple m|adreno 7|adreno 8/.test(renderer)) {
          gpuTier = 'high'
        }
      }
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()
    }
  } catch {
    // Fallback
  }

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

let _cachedPreset: PerfPreset | null = null

export function getPerf(): PerfPreset {
  if (_cachedPreset) return _cachedPreset

  const tier = detectTier()
  switch (tier) {
    case 'low': _cachedPreset = LOW; break
    case 'medium': _cachedPreset = MEDIUM; break
    case 'high': _cachedPreset = HIGH; break
  }

  console.log(`[perf] Detected tier: ${tier} (${navigator.userAgent.slice(0, 60)}...)`)
  return _cachedPreset
}
