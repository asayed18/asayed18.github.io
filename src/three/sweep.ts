import * as THREE from 'three'
import { roadFrame } from './path'

/**
 * One straight edge of a road cross-section, from (l0, y0) to (l1, y1): `l` is the distance to
 * the left of the centre line, `y` the height. The surface faces T x (edge direction), so a
 * flat edge must run towards the left (l0 < l1) to face up, and a vertical edge on the left of
 * the road must rise (on the right, fall) to face the road.
 */
export interface ProfileEdge {
  l0: number
  y0: number
  l1: number
  y1: number
}

interface SweepOptions {
  from: number
  to: number
  /** Distance between two cross-sections along the road. */
  step: number
  /** World units per texture repeat, across and along the road. */
  tile?: number
  /** Leave out the quads whose start distance returns false (dashed markings). */
  keep?: (distance: number) => boolean
}

/**
 * Sweeps a cross-section along the road: one geometry for the carriageway, the curbs, the paint.
 * UVs run along the profile (u) and along the road (v), in units of `tile`.
 */
export function sweepProfile(edges: ProfileEdge[], { from, to, step, tile = 1, keep }: SweepOptions): THREE.BufferGeometry {
  const frames = []
  for (let d = from; d <= to + 1e-6; d += step) frames.push({ d, f: roadFrame(d) })

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const p = new THREE.Vector3()
  const n = new THREE.Vector3()
  const dir = new THREE.Vector3()

  for (const edge of edges) {
    let u0 = 0
    const len = Math.hypot(edge.l1 - edge.l0, edge.y1 - edge.y0)
    const u1 = u0 + len / tile
    let previous = -1
    for (let i = 0; i < frames.length; i++) {
      const { d, f } = frames[i]
      // Edge direction in world space, then the face normal T x dir.
      dir.copy(f.left).multiplyScalar(edge.l1 - edge.l0).addScaledVector(THREE.Object3D.DEFAULT_UP, edge.y1 - edge.y0).normalize()
      n.crossVectors(f.tangent, dir).normalize()
      const base = positions.length / 3
      for (const [l, y, u] of [
        [edge.l0, edge.y0, u0],
        [edge.l1, edge.y1, u1],
      ]) {
        p.copy(f.point).addScaledVector(f.left, l)
        p.y = y
        positions.push(p.x, p.y, p.z)
        normals.push(n.x, n.y, n.z)
        uvs.push(u, d / tile)
      }
      if (previous >= 0 && (!keep || keep(frames[i - 1].d))) {
        // a = previous l0, b = previous l1, c = this l0, e = this l1; triangles face T x dir.
        const a = previous
        const b = previous + 1
        const c = base
        const e = base + 1
        indices.push(a, c, b, b, c, e)
      }
      previous = base
    }
    u0 = 0
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeBoundingSphere()
  g.computeBoundingBox()
  return g
}
