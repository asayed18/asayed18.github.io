import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import { ROAD_WIDTH, SIDEWALK_WIDTH } from './config'
import { CITY_FLOOR_HEIGHT, FACADE_STYLE, PARAPET_HEIGHT, facadeBays, type FacadeStyle } from './facade'
import { parsePeriodMonths, monthsToHeight } from './period'
import {
  EXPERIENCE_LATERAL,
  ROAD_LEAD_IN,
  ROAD_LEAD_OUT,
  ROAD_LENGTH,
  experiencePose,
  experienceSide,
  roadFrame,
} from './path'

/**
 * The city, generated once from a fixed seed.
 *
 * - The street wall: buildings side by side along both sidewalks, following the curve.
 * - Blocks behind it, in rows parallel to the road, rising towards the edge of the city.
 * - The skyline: a much larger, coarser field of towers out to where the haze swallows them.
 *   It is the bulk of the city but costs one instanced draw and casts no shadow.
 *
 * The Giza pyramids and the Fernsehturm are placed from the camera's own view of the LDC and
 * Babbel buildings, beside the building and away from the text panel, and every block on the
 * line of sight to them is kept low enough for the landmark to show above it.
 */

export interface BuildingSpec {
  x: number
  z: number
  /** Rotation around y; local x runs across the road, local z along it. */
  yaw: number
  /** Size across (local x), height, size along (local z). */
  w: number
  h: number
  d: number
  /** Height of the base above the ground (setback tiers stand on their tower). */
  y0: number
  floorH: number
  bay: number
  style: FacadeStyle
  /** Wall colour multiplier (linear RGB, around 1): muted plaster, brick, concrete, glass. */
  color: [number, number, number]
}

export interface DetailBox {
  pos: [number, number, number]
  scale: [number, number, number]
  yaw: number
  /** Tilt around the local z axis (awnings). */
  rotZ?: number
}

export interface Pyramid {
  x: number
  z: number
  height: number
  /** Circumradius of the square base. */
  radius: number
  yaw: number
}

export interface ExperiencePlacement {
  distance: number
  x: number
  z: number
  yaw: number
  side: number
  height: number
}

export interface CityLayout {
  near: BuildingSpec[]
  far: BuildingSpec[]
  cornices: DetailBox[]
  balconies: DetailBox[]
  railings: DetailBox[]
  awnings: DetailBox[]
  pyramids: Pyramid[]
  tower: { x: number; z: number } | null
  experiences: ExperiencePlacement[]
}

/** Height of the Fernsehturm model, base to antenna tip. */
export const TOWER_HEIGHT = 96
/** Height of the sphere's centre on the tower model, as a fraction of its height. */
export const TOWER_SPHERE_AT = 0.56

const FRONT = ROAD_WIDTH / 2 + SIDEWALK_WIDTH

function hash(i: number) {
  const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** Smooth value noise, for clusters of towers ("downtowns") instead of uniform scatter. */
function noise2(x: number, z: number) {
  const xi = Math.floor(x)
  const zi = Math.floor(z)
  const fx = x - xi
  const fz = z - zi
  const s = (t: number) => t * t * (3 - 2 * t)
  const h = (a: number, b: number) => hash(a * 157 + b * 311)
  const a = h(xi, zi) + (h(xi + 1, zi) - h(xi, zi)) * s(fx)
  const b = h(xi, zi + 1) + (h(xi + 1, zi + 1) - h(xi, zi + 1)) * s(fx)
  return a + (b - a) * s(fz)
}

interface Footprint {
  x: number
  z: number
  hw: number
  hd: number
  c: number
  s: number
}

/** Rotated rectangles in a spatial hash, tested with separating axes. */
class Lots {
  private cells = new Map<string, Footprint[]>()
  private static CELL = 12

  private key(cx: number, cz: number) {
    return `${cx},${cz}`
  }

  private range(f: Footprint) {
    const r = Math.hypot(f.hw, f.hd)
    const C = Lots.CELL
    return [Math.floor((f.x - r) / C), Math.floor((f.x + r) / C), Math.floor((f.z - r) / C), Math.floor((f.z + r) / C)]
  }

  static make(x: number, z: number, yaw: number, w: number, d: number): Footprint {
    return { x, z, hw: w / 2, hd: d / 2, c: Math.cos(yaw), s: Math.sin(yaw) }
  }

  overlaps(f: Footprint, margin = 0.05) {
    const [x0, x1, z0, z1] = this.range(f)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz))
        if (!list) continue
        for (const g of list) if (intersects(f, g, margin)) return true
      }
    }
    return false
  }

  add(f: Footprint) {
    const [x0, x1, z0, z1] = this.range(f)
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz)
        const list = this.cells.get(k)
        if (list) list.push(f)
        else this.cells.set(k, [f])
      }
    }
  }
}

function intersects(a: Footprint, b: Footprint, margin: number) {
  // Local x axis in world space is (cos, -sin), local z is (sin, cos).
  const axes = [
    [a.c, -a.s],
    [a.s, a.c],
    [b.c, -b.s],
    [b.s, b.c],
  ]
  const dx = b.x - a.x
  const dz = b.z - a.z
  for (const [nx, nz] of axes) {
    const ra = a.hw * Math.abs(a.c * nx - a.s * nz) + a.hd * Math.abs(a.s * nx + a.c * nz)
    const rb = b.hw * Math.abs(b.c * nx - b.s * nz) + b.hd * Math.abs(b.s * nx + b.c * nz)
    if (Math.abs(dx * nx + dz * nz) > ra + rb + margin) return false
  }
  return true
}

/** Centre-line samples of the whole road, for distance queries. */
function sampleRoad(step: number) {
  const pts: { x: number; z: number; yaw: number }[] = []
  for (let d = -ROAD_LEAD_IN; d <= ROAD_LENGTH + ROAD_LEAD_OUT; d += step) {
    const f = roadFrame(d)
    pts.push({ x: f.point.x, z: f.point.z, yaw: f.yaw })
  }
  return pts
}

interface SightLine {
  ex: number
  ey: number
  ez: number
  tx: number
  ty: number
  tz: number
  /** Half width of the corridor kept clear at the landmark end. */
  halfWidth: number
}

/** Densities per preset: the share of lots built on, and the spacing of the skyline grid. */
export interface CityDensity {
  /** Lots per side of a city block in the outer districts (2 to 4). */
  lotsPerBlock: number
  /** How far from the road the city reaches. */
  skylineReach: number
}

/**
 * Muted, slightly desaturated wall colours, as real cities look under haze: creams and sand
 * plaster, faded terracotta brick, warm and cool concrete, blue-grey curtain-wall frames.
 */
const PALETTE: Record<FacadeStyle, string[]> = {
  [FACADE_STYLE.punched]: ['#f2e6d0', '#ead8c0', '#e8d3c8', '#dfe2d8', '#e6e1d8', '#d9dde2', '#efe0c4', '#e2d6cc'],
  [FACADE_STYLE.brick]: ['#c99a86', '#b8846f', '#d1a48c', '#a9806c', '#c4a089', '#b48f80'],
  [FACADE_STYLE.ribbon]: ['#dcdad5', '#cfd2d4', '#e4ded2', '#d6d3cb', '#c9ced2'],
  [FACADE_STYLE.curtain]: ['#c9d2d8', '#bfc8cc', '#d5d8d6', '#b9c3cb'],
}
const paletteColor = (style: FacadeStyle, r: number, tone: number): [number, number, number] => {
  const list = PALETTE[style]
  const c = new THREE.Color(list[Math.floor(r * list.length) % list.length])
  return [c.r * tone, c.g * tone, c.b * tone]
}

export function generateCity(experiences: Experience[], density: CityDensity): CityLayout {
  const lots = new Lots()
  const road = sampleRoad(2)
  const clearOfRoad = FRONT - 0.05

  const nearestRoad = (x: number, z: number) => {
    let best = Infinity
    let yaw = 0
    let index = 0
    for (let i = 0; i < road.length; i++) {
      const p = road[i]
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2
      if (dd < best) {
        best = dd
        yaw = p.yaw
        index = i
      }
    }
    return { dist: Math.sqrt(best), yaw, beyondEnd: index === road.length - 1 }
  }

  // --- Experience buildings, and the camera's view of each ---------------------------------------
  const placements: ExperiencePlacement[] = experiences.map((exp, index) => {
    const distance = exp.position * ROAD_LENGTH
    const f = roadFrame(distance)
    const side = experienceSide(index)
    const p = f.point.clone().addScaledVector(f.left, side * EXPERIENCE_LATERAL)
    return { distance, x: p.x, z: p.z, yaw: f.yaw, side, height: monthsToHeight(parsePeriodMonths(exp.period)) }
  })
  // Plazas around them: nothing else is built there.
  for (const pl of placements) lots.add(Lots.make(pl.x, pl.z, pl.yaw, 9, 12))

  /**
   * A point seen from the camera of experience `index`, `angle` radians beside the building
   * (away from the text panel) and `dist` units away.
   */
  const besideView = (index: number, angle: number, dist: number) => {
    const pl = placements[index]
    const pose = experiencePose(pl.distance, index, pl.height)
    const view = Math.atan2(pose.lookAt.x - pose.position.x, pose.lookAt.z - pose.position.z)
    const yaw = view + pl.side * angle
    return {
      x: pose.position.x + Math.sin(yaw) * dist,
      z: pose.position.z + Math.cos(yaw) * dist,
      eye: pose.position,
      view: yaw,
    }
  }

  const sights: SightLine[] = []
  const clearings: { x: number; z: number; r: number }[] = []

  // --- Giza: three pyramids beside the first building ----------------------------------------------
  const pyramids: Pyramid[] = []
  if (placements[0]) {
    const plan = [
      // angle (deg), distance, height: Khufu, Khafre, Menkaure, in their real proportions.
      { a: 25, dist: 125, h: 44 },
      { a: 36, dist: 160, h: 42 },
      { a: 45, dist: 172, h: 20 },
    ]
    for (const step of plan) {
      const at = besideView(0, THREE.MathUtils.degToRad(step.a), step.dist)
      // A square base 1.57 times the height, turned to face the viewer at 45 degrees.
      const radius = (step.h * 1.57) / Math.SQRT2
      pyramids.push({ x: at.x, z: at.z, height: step.h, radius, yaw: at.view + Math.PI / 4 })
      clearings.push({ x: at.x, z: at.z, r: radius + 22 })
      // Keep the top two thirds of each pyramid clear of the city.
      sights.push({ ex: at.eye.x, ey: at.eye.y, ez: at.eye.z, tx: at.x, ty: step.h * 0.32, tz: at.z, halfWidth: radius * 0.8 })
    }
  }

  // --- Berlin: the Fernsehturm beside the Babbel building ------------------------------------------
  let tower: CityLayout['tower'] = null
  const towerIndex = placements.length > 4 ? 4 : -1
  if (towerIndex >= 0) {
    const at = besideView(towerIndex, THREE.MathUtils.degToRad(27), 118)
    tower = { x: at.x, z: at.z }
    clearings.push({ x: at.x, z: at.z, r: 16 })
    // The sphere and everything above it stay in sight; the shaft disappears into the city.
    sights.push({ ex: at.eye.x, ey: at.eye.y, ez: at.eye.z, tx: at.x, ty: TOWER_HEIGHT * 0.42, tz: at.z, halfWidth: 9 })
  }

  /** Tallest a building standing at (x, z) with this footprint radius may be. */
  const heightCap = (x: number, z: number, r: number) => {
    let cap = Infinity
    for (const c of clearings) if (Math.hypot(x - c.x, z - c.z) < c.r + r) return 0
    for (const s of sights) {
      const vx = s.tx - s.ex
      const vz = s.tz - s.ez
      const len2 = vx * vx + vz * vz
      const t = ((x - s.ex) * vx + (z - s.ez) * vz) / len2
      if (t <= 0 || t >= 1) continue
      const px = s.ex + vx * t - x
      const pz = s.ez + vz * t - z
      const off = Math.hypot(px, pz)
      if (off > 1.5 + s.halfWidth * t + r) continue
      cap = Math.min(cap, s.ey + (s.ty - s.ey) * t - 0.6)
    }
    return cap
  }

  const near: BuildingSpec[] = []
  const far: BuildingSpec[] = []

  const pickStyle = (r: number, tall: boolean): FacadeStyle => {
    if (tall) return r < 0.45 ? FACADE_STYLE.curtain : r < 0.75 ? FACADE_STYLE.ribbon : FACADE_STYLE.punched
    return r < 0.4 ? FACADE_STYLE.punched : r < 0.75 ? FACADE_STYLE.brick : FACADE_STYLE.ribbon
  }
  const bayWidth = (style: FacadeStyle, r: number) =>
    style === FACADE_STYLE.brick ? 1.05 + 0.2 * r : style === FACADE_STYLE.curtain ? 1.3 : 1.25 + 0.35 * r

  let seed = 1
  const rnd = () => hash(seed++ * 1.618)

  /** Places a building if its lot is free and clear of the road; returns it or null. */
  const place = (
    list: BuildingSpec[],
    x: number,
    z: number,
    yaw: number,
    w: number,
    d: number,
    floors: number,
    checkRoad: boolean
  ) => {
    const r = Math.hypot(w, d) / 2
    const cap = heightCap(x, z, r)
    const capFloors = Math.floor((cap - PARAPET_HEIGHT) / CITY_FLOOR_HEIGHT)
    floors = Math.min(floors, capFloors)
    if (floors < 1) return null
    const fp = Lots.make(x, z, yaw, w, d)
    if (lots.overlaps(fp)) return null
    if (checkRoad) {
      // Every corner must stand behind the sidewalk.
      const c = Math.cos(yaw)
      const s = Math.sin(yaw)
      for (const [lx, lz] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
        [0, 0],
      ]) {
        const cx = x + lx * c + lz * s
        const cz = z - lx * s + lz * c
        if (nearestRoad(cx, cz).dist < clearOfRoad) return null
      }
    }
    lots.add(fp)
    const tall = floors >= 9
    const style = pickStyle(rnd(), tall)
    const b: BuildingSpec = {
      x,
      z,
      yaw,
      w,
      d,
      h: floors * CITY_FLOOR_HEIGHT + PARAPET_HEIGHT,
      y0: 0,
      floorH: CITY_FLOOR_HEIGHT,
      bay: bayWidth(style, rnd()),
      style,
      color: paletteColor(style, rnd(), style === FACADE_STYLE.curtain ? 0.85 + 0.25 * rnd() : 0.8 + 0.35 * rnd()),
    }
    list.push(b)
    return b
  }

  // --- Street wall ---------------------------------------------------------------------------------
  const frontage: { b: BuildingSpec; side: number }[] = []
  for (const side of [1, -1]) {
    let d = -ROAD_LEAD_IN + 1
    while (d < ROAD_LENGTH + ROAD_LEAD_OUT - 2) {
      const along = 5 + rnd() * 3.5
      const across = 6 + rnd() * 4
      const f = roadFrame(d + along / 2)
      const x = f.point.x + f.left.x * side * (FRONT + across / 2)
      const z = f.point.z + f.left.z * side * (FRONT + across / 2)
      const floors = 3 + Math.floor(rnd() * 4)
      const b = place(near, x, z, f.yaw, across, along, floors, true)
      if (b) frontage.push({ b, side })
      // Side streets now and then.
      d += along + (rnd() < 0.12 ? 3.5 : 0.05)
    }
  }

  // --- Blocks behind the street wall ---------------------------------------------------------------
  const rows = [
    { offset: FRONT + 14, floors: [4, 9] },
    { offset: FRONT + 25, floors: [5, 11] },
  ]
  for (const row of rows) {
    for (const side of [1, -1]) {
      let d = -ROAD_LEAD_IN
      while (d < ROAD_LENGTH + ROAD_LEAD_OUT + 10) {
        const along = 6 + rnd() * 7
        const across = 7 + rnd() * 5
        const f = roadFrame(d + along / 2)
        const lateral = side * (row.offset + (rnd() - 0.5) * 3)
        const x = f.point.x + f.left.x * lateral
        const z = f.point.z + f.left.z * lateral
        const downtown = noise2(x / 70, z / 70)
        const span = row.floors[1] - row.floors[0]
        const floors = row.floors[0] + Math.floor(rnd() * span * (0.4 + downtown))
        // An empty lot now and then: a square, a car park.
        if (rnd() > 0.04) place(near, x, z, f.yaw + (rnd() - 0.5) * 0.06, across, along, floors, true)
        d += along + 0.4 + rnd() * 1.2
      }
    }
  }

  // --- The rest of the city: a street grid of full blocks -----------------------------------------
  // Real cities are not scattered boxes: blocks of 24 x 32 units between 6 unit streets, each
  // block divided into lots built wall to wall. Heights follow districts (low-rise quarters, a
  // couple of downtowns with towers) and change little from one lot to its neighbour.
  const reach = density.skylineReach
  const BLOCK_X = 24
  const BLOCK_Z = 32
  const STREET = 6
  const split = density.lotsPerBlock
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const p of road) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z)
    maxZ = Math.max(maxZ, p.z)
  }
  const pitchX = BLOCK_X + STREET
  const pitchZ = BLOCK_Z + STREET
  // Nothing behind the start: the camera never looks back there.
  for (let bx = Math.floor((minX - reach) / pitchX) * pitchX; bx <= maxX + reach; bx += pitchX) {
    for (let bz = Math.floor(Math.max(minZ - reach, -60) / pitchZ) * pitchZ; bz <= maxZ + reach; bz += pitchZ) {
      const cx = bx + BLOCK_X / 2
      const cz = bz + BLOCK_Z / 2
      const blockDist = nearestRoad(cx, cz).dist
      if (blockDist > reach + 20 || blockDist < FRONT) continue
      const district = noise2(cx / 110, cz / 110)
      const downtown = Math.max(0, district - 0.55) / 0.45
      const blockFloors = 4 + Math.floor(district * 7 + rnd() * 3)
      // A tower takes a whole block now and then, more often downtown.
      if (rnd() < 0.04 + 0.35 * downtown) {
        const floors = 16 + Math.floor(rnd() * 14 + downtown * 16)
        const w = BLOCK_X * (0.55 + rnd() * 0.25)
        const d = BLOCK_Z * (0.45 + rnd() * 0.25)
        // Low podium around the tower, then the tower itself.
        const list = blockDist < 60 ? near : far
        place(list, cx, cz, 0, BLOCK_X - 0.6, BLOCK_Z - 0.6, 3 + Math.floor(rnd() * 2), blockDist < FRONT + 30)
        const podium = list[list.length - 1]
        if (podium && podium.x === cx && podium.z === cz) {
          const cap = heightCap(cx, cz, Math.hypot(w, d) / 2)
          const th = Math.min(floors * CITY_FLOOR_HEIGHT + PARAPET_HEIGHT, cap - podium.h)
          if (th > 8) {
            const style = rnd() < 0.6 ? FACADE_STYLE.curtain : FACADE_STYLE.ribbon
            list.push({
              ...podium,
              w,
              d,
              y0: podium.h - PARAPET_HEIGHT,
              h: th,
              style,
              bay: bayWidth(style, rnd()),
              color: paletteColor(style, rnd(), 0.85 + 0.25 * rnd()),
            })
          }
        }
        continue
      }
      // Lots wall to wall: `split` across, a few more along the long side.
      const nx = split
      const nz = split + 1
      const lw = BLOCK_X / nx
      const ld = BLOCK_Z / nz
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const x = bx + lw * (i + 0.5)
          const z = bz + ld * (j + 0.5)
          const dist = nearestRoad(x, z).dist
          if (dist > reach) continue
          const floors = Math.max(2, blockFloors + Math.floor((rnd() - 0.5) * 4) + (rnd() < 0.08 ? 6 : 0))
          place(dist < 60 ? near : far, x, z, 0, lw - 0.3, ld - 0.3, floors, dist < FRONT + 30)
        }
      }
    }
  }

  // --- Setbacks: some towers continue in a narrower tier on top -------------------------------------
  for (const list of [near, far]) {
    const count = list.length
    for (let i = 0; i < count; i++) {
      const b = list[i]
      if (b.h < 20 || rnd() < 0.45) continue
      const cap = heightCap(b.x, b.z, Math.hypot(b.w, b.d) / 2)
      const tierFloors = 2 + Math.floor(rnd() * 7)
      const th = tierFloors * CITY_FLOOR_HEIGHT + PARAPET_HEIGHT - 0.01
      if (b.h + th > cap) continue
      list.push({ ...b, w: b.w * 0.66, d: b.d * 0.66, y0: b.h - PARAPET_HEIGHT, h: th })
    }
  }

  // --- Details: cornices on every block near the road, balconies and awnings on the street wall ------
  const cornices: DetailBox[] = []
  const balconies: DetailBox[] = []
  const railings: DetailBox[] = []
  const awnings: DetailBox[] = []
  const toWorld = (b: BuildingSpec, lx: number, y: number, lz: number): [number, number, number] => {
    const c = Math.cos(b.yaw)
    const s = Math.sin(b.yaw)
    return [b.x + lx * c + lz * s, y, b.z - lx * s + lz * c]
  }
  for (const b of near) {
    const top = b.y0 + b.h
    if (b.style === FACADE_STYLE.curtain) {
      cornices.push({ pos: toWorld(b, 0, top - 0.06, 0), scale: [b.w + 0.06, 0.12, b.d + 0.06], yaw: b.yaw })
    } else {
      cornices.push({ pos: toWorld(b, 0, top - 0.16, 0), scale: [b.w + 0.36, 0.32, b.d + 0.36], yaw: b.yaw })
      cornices.push({ pos: toWorld(b, 0, top - 0.42, 0), scale: [b.w + 0.16, 0.12, b.d + 0.16], yaw: b.yaw })
    }
  }
  for (const { b, side } of frontage) {
    // The face towards the road: the building stands on local +x times `side` of it.
    const inward = -side
    const faceX = inward * (b.w / 2)
    const { centers, width } = facadeBays(b.d, b.bay)
    const floors = Math.floor((b.h - PARAPET_HEIGHT) / b.floorH)
    centers.forEach((c) => {
      if (rnd() < 0.3) {
        awnings.push({
          pos: toWorld(b, faceX + inward * 0.34, b.floorH * 0.8 + 0.1, c),
          scale: [0.7, 0.03, width * 0.8],
          yaw: b.yaw,
          rotZ: inward * -0.26,
        })
      }
    })
    if (b.style === FACADE_STYLE.punched || b.style === FACADE_STYLE.brick) {
      for (let fl = 1; fl < floors; fl++) {
        centers.forEach((c) => {
          if (rnd() < 0.55) return
          const y = fl * b.floorH + b.floorH * 0.3
          balconies.push({ pos: toWorld(b, faceX + inward * 0.3, y, c), scale: [0.6, 0.08, width * 0.78], yaw: b.yaw })
          railings.push({ pos: toWorld(b, faceX + inward * 0.58, y + 0.3, c), scale: [0.03, 0.52, width * 0.78], yaw: b.yaw })
        })
      }
    }
  }

  return { near, far, cornices, balconies, railings, awnings, pyramids, tower, experiences: placements }
}

