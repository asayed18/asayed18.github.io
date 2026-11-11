import * as THREE from 'three'
import type { CityLayout } from './cityLayout'

/**
 * Ambient occlusion on the ground, baked once when the city is generated.
 *
 * A ray-traced bake would find that streets get less sky light the closer they are to a wall,
 * and that the ground under a tree is darker. The city is generated in the browser, so there is
 * no offline bake to ship: instead the footprints are drawn from above on a canvas and blurred at
 * two scales (a tight contact shadow along each wall, and a broad darkening of narrow streets).
 * Every ground material reads the result at its world position. It costs two texture lookups
 * per pixel and nothing per frame.
 */

const WHITE = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
WHITE.needsUpdate = true

/** Shared by every ground material, so the bake reaches all of them without a recompile. */
const uniforms = {
  uAoNear: { value: WHITE as THREE.Texture },
  uAoFar: { value: WHITE as THREE.Texture },
  /** World x, z of the canvas corner, and its size in world units. */
  uAoBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
}

let baked: THREE.Texture[] = []

export function bakeGroundAO(city: CityLayout): void {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const b of city.near) {
    minX = Math.min(minX, b.x)
    maxX = Math.max(maxX, b.x)
    minZ = Math.min(minZ, b.z)
    maxZ = Math.max(maxZ, b.z)
  }
  if (!isFinite(minX)) return
  const pad = 30
  const size = Math.max(maxX - minX, maxZ - minZ) + 2 * pad
  const x0 = (minX + maxX) / 2 - size / 2
  const z0 = (minZ + maxZ) / 2 - size / 2

  const RES = 1024
  const scale = RES / size
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = RES
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, RES, RES)
  const rect = (x: number, z: number, yaw: number, w: number, d: number) => {
    ctx.save()
    ctx.translate((x - x0) * scale, (z - z0) * scale)
    // Canvas y runs along world z; local x of a footprint is (cos, -sin) in world x, z.
    ctx.rotate(-yaw)
    ctx.fillRect((-w / 2) * scale, (-d / 2) * scale, w * scale, d * scale)
    ctx.restore()
  }
  ctx.fillStyle = '#000'
  for (const list of [city.near, city.far]) {
    for (const b of list) if (b.y0 === 0) rect(b.x, b.z, b.yaw, b.w, b.d)
  }
  for (const e of city.experiences) rect(e.x, e.z, e.yaw, 5, 9)
  // Tree crowns: a soft shade on the ground below them.
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  for (const t of city.trees) {
    ctx.beginPath()
    ctx.arc((t.x - x0) * scale, (t.z - z0) * scale, t.crown * 0.9 * scale, 0, Math.PI * 2)
    ctx.fill()
  }

  // Downsampling is the blur: linear filtering of a small texture spreads each footprint.
  const shrink = (res: number) => {
    const c = document.createElement('canvas')
    c.width = c.height = res
    const g = c.getContext('2d')!
    g.imageSmoothingEnabled = true
    g.imageSmoothingQuality = 'high'
    g.drawImage(canvas, 0, 0, res, res)
    const tex = new THREE.CanvasTexture(c)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = false
    // Canvas row 0 is world z0, at v = 0.
    tex.flipY = false
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
    return tex
  }
  baked.forEach((t) => t.dispose())
  // About 1.9 units per texel (contact) and 7.5 units per texel (street canyons).
  const near = shrink(Math.round(size / 1.9))
  const far = shrink(Math.round(size / 7.5))
  baked = [near, far]
  uniforms.uAoNear.value = near
  uniforms.uAoFar.value = far
  uniforms.uAoBounds.value.set(x0, z0, size, size)
}

/** For a ground material: reads the baked occlusion at the fragment's world position. */
export function groundAOCompile(shader: THREE.Shader): void {
  Object.assign(shader.uniforms, uniforms)
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec2 vAoXZ;')
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vAoXZ = (modelMatrix * vec4(transformed, 1.0)).xz;'
    )
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec2 vAoXZ;\nuniform sampler2D uAoNear;\nuniform sampler2D uAoFar;\nuniform vec4 uAoBounds;'
    )
    .replace(
      '#include <aomap_fragment>',
      /* glsl */ `#include <aomap_fragment>
  {
    vec2 aoUv = (vAoXZ - uAoBounds.xy) / uAoBounds.zw;
    float open = texture2D(uAoNear, aoUv).r;
    float wide = texture2D(uAoFar, aoUv).r;
    float groundAO = clamp(1.0 - 0.6 * (1.0 - open) - 0.35 * (1.0 - wide), 0.25, 1.0);
    reflectedLight.indirectDiffuse *= groundAO;
    reflectedLight.indirectSpecular *= groundAO;
    reflectedLight.directDiffuse *= mix(1.0, groundAO, 0.45);
  }`
    )
}

export const groundAOKey = () => 'ground-ao-v1'
