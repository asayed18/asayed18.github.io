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

/** A flat rectangle on the ground: a stretch of side street, a park lawn. */
export interface GroundPatch {
  x: number
  z: number
  /** Rotation around y; `length` runs along local z. */
  yaw: number
  width: number
  length: number
}

export interface Tree {
  x: number
  z: number
  /** Height of the trunk up to where the crown starts. */
  trunk: number
  /** Radius of the crown. */
  crown: number
  /** 0 to 1: picks the shade of green. */
  tone: number
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
  /** Side streets of the grid, running into the avenue. */
  streets: GroundPatch[]
  /** Zebra stripes on the avenue where a side street meets it. */
  crossings: DetailBox[]
  parks: GroundPatch[]
  trees: Tree[]
  /** Plant rooms, stair bulkheads and air-conditioning units on the flat roofs. */
  rooftopBoxes: DetailBox[]
  /** Water tanks on the roofs (unit cylinders). */
  rooftopTanks: DetailBox[]
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
  /** Share of the park and side-street trees that are planted (0 to 1). */
  greenery: number
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
      // Spread out so each silhouette stands on its own, as from the Giza plateau viewpoint.
      { a: 20, dist: 150, h: 38 },
      { a: 42, dist: 200, h: 36 },
      { a: 55, dist: 215, h: 16 },
    ]
    for (const step of plan) {
      const at = besideView(0, THREE.MathUtils.degToRad(step.a), step.dist)
      // A square base 1.57 times the height. One face is turned almost square to the viewer
      // (the cone's corners are on its axes, hence the eighth of a turn), with a little of the
      // next face showing so the edge between them reads.
      const radius = (step.h * 1.57) / Math.SQRT2
      pyramids.push({ x: at.x, z: at.z, height: step.h, radius, yaw: at.view + Math.PI / 4 + 0.14 })
      clearings.push({ x: at.x, z: at.z, r: radius + 14 })
      // Keep the top two thirds of each pyramid clear of the city.
      sights.push({ ex: at.eye.x, ey: at.eye.y, ez: at.eye.z, tx: at.x, ty: step.h * 0.32, tz: at.z, halfWidth: radius * 0.6 })
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
    if (capFloors < 1) return null
    // Under a sight line, do not shave every roof to the same line: a real skyline is ragged,
    // so most buildings there stop one to three storeys short of what the view allows.
    if (floors > capFloors) floors = Math.max(capFloors - Math.floor(rnd() * 3.4), Math.min(capFloors, 2))
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

  // --- The street grid ------------------------------------------------------------------------------
  // Blocks of 24 x 32 units between 6 unit streets. The cross streets (along x) run all the way
  // into the avenue, cutting the street wall as real side streets do; the streets along z stop
  // where the blocks lining the avenue begin. Streets are reserved before anything is built.
  const reach = density.skylineReach
  const BLOCK_X = 24
  const BLOCK_Z = 32
  const STREET = 6
  const pitchX = BLOCK_X + STREET
  const pitchZ = BLOCK_Z + STREET
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
  // Shift the grid along z so no cross street runs into an experience building.
  let gridZ = 0
  let bestClearance = -1
  for (let o = 0; o < pitchZ; o++) {
    let clearance = Infinity
    for (const pl of placements) {
      const m = (((pl.z - o - BLOCK_Z - STREET / 2) % pitchZ) + pitchZ) % pitchZ
      clearance = Math.min(clearance, Math.min(m, pitchZ - m))
    }
    if (clearance > bestClearance) {
      bestClearance = clearance
      gridZ = o
    }
  }
  const gridX0 = Math.floor((minX - reach) / pitchX) * pitchX
  const gridZ0 = Math.floor(Math.max(minZ - reach, -60) / pitchZ) * pitchZ + gridZ - pitchZ
  const nearZone = FRONT + 32

  const streets: GroundPatch[] = []
  const streetLots: Footprint[] = []
  const inClearing = (x: number, z: number, pad: number) => clearings.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + pad)
  const nearPlaza = (x: number, z: number) => placements.some((pl) => Math.hypot(x - pl.x, z - pl.z) < 9.5)
  /** Lays a street along a line in chunks, keeping the stretches that pass `keep`. */
  const layStreet = (x0: number, z0: number, dx: number, dz: number, length: number, keep: (x: number, z: number, dist: number) => boolean) => {
    const CHUNK = 3
    const yaw = Math.atan2(dx, dz)
    let start = -1
    const flush = (end: number) => {
      if (start < 0) return
      const mid = (start + end) / 2
      const len = end - start
      const x = x0 + dx * mid
      const z = z0 + dz * mid
      streets.push({ x, z, yaw, width: STREET, length: len })
      const fp = Lots.make(x, z, yaw, STREET, len)
      lots.add(fp)
      streetLots.push(fp)
      start = -1
    }
    for (let t = 0; t < length; t += CHUNK) {
      const x = x0 + dx * (t + CHUNK / 2)
      const z = z0 + dz * (t + CHUNK / 2)
      const dist = nearestRoad(x, z).dist
      const ok = dist <= reach && dist > ROAD_WIDTH / 2 + 0.5 && keep(x, z, dist) && !inClearing(x, z, 3) && !nearPlaza(x, z)
      if (ok && start < 0) start = t
      if (!ok) flush(t)
    }
    flush(length)
  }
  const spanX = maxX + reach - gridX0
  const spanZ = maxZ + reach - gridZ0
  const crossStreetZs: number[] = []
  for (let bz = gridZ0; bz <= maxZ + reach; bz += pitchZ) {
    const z = bz + BLOCK_Z + STREET / 2
    if (z < -50) continue
    crossStreetZs.push(z)
    layStreet(gridX0, z, 1, 0, spanX, () => true)
  }
  for (let bx = gridX0; bx <= maxX + reach; bx += pitchX) {
    const x = bx + BLOCK_X + STREET / 2
    layStreet(x, Math.max(gridZ0, -50), 0, 1, spanZ, (_x, _z, dist) => dist > nearZone)
  }

  // Zebra crossings on the avenue, just before each junction with a cross street.
  const crossings: DetailBox[] = []
  for (const z of crossStreetZs) {
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1]
      const b = road[i]
      if ((a.z - z) * (b.z - z) > 0) continue
      const d = -ROAD_LEAD_IN + (i - 1) * 2 - (STREET / 2 + 2.5)
      if (d < 2 - ROAD_LEAD_IN || placements.some((pl) => Math.abs(pl.distance - d) < 14)) continue
      const f = roadFrame(d)
      for (let l = -ROAD_WIDTH / 2 + 0.9; l <= ROAD_WIDTH / 2 - 0.8; l += 0.9) {
        crossings.push({ pos: [f.point.x + f.left.x * l, -0.026, f.point.z + f.left.z * l], scale: [0.45, 0.01, 2.6], yaw: f.yaw })
      }
    }
  }

  // --- Street wall ---------------------------------------------------------------------------------
  const frontage: { b: BuildingSpec; side: number }[] = []
  const squares: GroundPatch[] = []
  for (const side of [1, -1]) {
    let d = -ROAD_LEAD_IN + 1
    while (d < ROAD_LENGTH + ROAD_LEAD_OUT - 2) {
      const along = 5 + rnd() * 3.5
      const across = 6 + rnd() * 4
      const f = roadFrame(d + along / 2)
      const x = f.point.x + f.left.x * side * (FRONT + across / 2)
      const z = f.point.z + f.left.z * side * (FRONT + across / 2)
      const floors = 3 + Math.floor(rnd() * 4)
      // A small square on the avenue now and then: lawn, trees, a hedge along the sidewalk.
      if (rnd() < 0.13 && !placements.some((pl) => Math.abs(pl.distance - d) < 16)) {
        const len = 11 + rnd() * 5
        const depth = 9 + rnd() * 3
        const g = roadFrame(d + len / 2)
        const gx = g.point.x + g.left.x * side * (FRONT + depth / 2)
        const gz = g.point.z + g.left.z * side * (FRONT + depth / 2)
        const fp = Lots.make(gx, gz, g.yaw, depth, len)
        if (!lots.overlaps(fp) && heightCap(gx, gz, 6) > 0) {
          lots.add(fp)
          squares.push({ x: gx, z: gz, yaw: g.yaw, width: depth, length: len })
          d += len + 0.05
          continue
        }
      }
      const b = place(near, x, z, f.yaw, across, along, floors, true)
      if (b) frontage.push({ b, side })
      // Wall to wall; past a side street or a plaza, try again a metre further on.
      d += b ? along + 0.05 : 1
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
        const b = place(near, x, z, f.yaw + (rnd() - 0.5) * 0.06, across, along, floors, true)
        d += b ? along + 0.3 + rnd() * 0.6 : 1
      }
    }
  }

  // --- The rest of the city: full blocks on the street grid -----------------------------------------
  // Real cities are not scattered boxes: each block is divided into lots built wall to wall.
  // Heights follow districts (low-rise quarters, a couple of downtowns with towers) and change
  // little from one lot to its neighbour. Now and then a block is a park.
  const split = density.lotsPerBlock
  const parks: GroundPatch[] = []
  const trees: Tree[] = []
  const addTree = (x: number, z: number, scale = 1) => {
    if (rnd() > density.greenery) return
    trees.push({ x, z, trunk: (1.6 + rnd() * 1.2) * scale, crown: (1.3 + rnd() * 0.9) * scale, tone: rnd() })
  }
  /** A shrub: a crown sitting almost on the ground. */
  const addBush = (x: number, z: number) => {
    if (rnd() > density.greenery) return
    trees.push({ x, z, trunk: 0.15 + rnd() * 0.2, crown: 0.5 + rnd() * 0.35, tone: rnd() })
  }
  // Nothing behind the start: the camera never looks back there.
  for (let bx = gridX0; bx <= maxX + reach; bx += pitchX) {
    for (let bz = gridZ0; bz <= maxZ + reach; bz += pitchZ) {
      const cx = bx + BLOCK_X / 2
      const cz = bz + BLOCK_Z / 2
      if (cz < -60) continue
      const blockDist = nearestRoad(cx, cz).dist
      if (blockDist > reach + 20 || blockDist < FRONT) continue
      const district = noise2(cx / 110, cz / 110)
      const downtown = Math.max(0, district - 0.55) / 0.45
      const blockFloors = 4 + Math.floor(district * 7 + rnd() * 3)
      if (blockDist > nearZone && blockDist < 200 && heightCap(cx, cz, 20) > 0 && rnd() < 0.3 * (1 - 0.7 * downtown)) {
        const fp = Lots.make(cx, cz, 0, BLOCK_X - 0.4, BLOCK_Z - 0.4)
        if (!lots.overlaps(fp)) {
          lots.add(fp)
          parks.push({ x: cx, z: cz, yaw: 0, width: BLOCK_X - 0.4, length: BLOCK_Z - 0.4 })
          // Trees in loose groves, shrubs along the edges of the lawn.
          const groves = 3 + Math.floor(rnd() * 3)
          for (let g = 0; g < groves; g++) {
            const gx = cx + (rnd() - 0.5) * (BLOCK_X - 8)
            const gz = cz + (rnd() - 0.5) * (BLOCK_Z - 8)
            const count = 4 + Math.floor(rnd() * 5)
            for (let i = 0; i < count; i++) addTree(gx + (rnd() - 0.5) * 9, gz + (rnd() - 0.5) * 9, 1.1 + rnd() * 0.3)
          }
          for (let i = 0; i < 16; i++) {
            const t = rnd()
            const edge = rnd() < 0.5
            const sx = edge ? (t - 0.5) * (BLOCK_X - 2) : (rnd() < 0.5 ? -1 : 1) * (BLOCK_X / 2 - 1.2)
            const sz = edge ? (rnd() < 0.5 ? -1 : 1) * (BLOCK_Z / 2 - 1.2) : (t - 0.5) * (BLOCK_Z - 2)
            addBush(cx + sx, cz + sz)
          }
          continue
        }
      }
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

  // Plant the squares on the avenue.
  for (const sq of squares) {
    parks.push(sq)
    const c = Math.cos(sq.yaw)
    const s = Math.sin(sq.yaw)
    const local = (lx: number, lz: number): [number, number] => [sq.x + lx * c + lz * s, sq.z - lx * s + lz * c]
    const count = 5 + Math.floor(rnd() * 4)
    for (let i = 0; i < count; i++) addTree(...local((rnd() - 0.5) * (sq.width - 3), (rnd() - 0.5) * (sq.length - 3)), 0.9 + rnd() * 0.4)
    for (let t = -sq.length / 2 + 0.8; t < sq.length / 2 - 0.5; t += 1.1) {
      for (const lx of [-sq.width / 2 + 0.6, sq.width / 2 - 0.6]) addBush(...local(lx, t))
    }
  }

  // --- Infill: close the leftover gaps near the avenue ------------------------------------------------
  // Where the rows along the curve meet the straight grid, odd-shaped gaps remain. Fill them with
  // smaller buildings, as a real city fills every leftover lot; now and then a pocket park.
  const INFILL = 3
  const infillReach = 75
  const probe = (x: number, z: number) => lots.overlaps(Lots.make(x, z, 0, 0.6, 0.6), 0)
  for (let x = minX - infillReach; x <= maxX + infillReach; x += INFILL) {
    for (let z = Math.max(minZ - infillReach, -40); z <= maxZ + infillReach; z += INFILL) {
      const jx = x + (hash(x * 3.1 + z * 7.7) - 0.5) * 1.2
      const jz = z + (hash(x * 5.3 - z * 2.9) - 0.5) * 1.2
      const nr = nearestRoad(jx, jz)
      if (nr.dist < FRONT + 1 || nr.dist > infillReach || nr.beyondEnd || probe(jx, jz)) continue
      const yaw = nr.dist < nearZone + 4 ? nr.yaw : 0
      const district = noise2(jx / 110, jz / 110)
      if (rnd() < 0.12 && nr.dist > FRONT + 12) {
        const fp = Lots.make(jx, jz, yaw, 8, 8)
        if (!lots.overlaps(fp) && heightCap(jx, jz, 6) > 0) {
          lots.add(fp)
          parks.push({ x: jx, z: jz, yaw, width: 8, length: 8 })
          for (let i = 0; i < 5; i++) addTree(jx + (rnd() - 0.5) * 5.5, jz + (rnd() - 0.5) * 5.5)
          for (let i = 0; i < 5; i++) addBush(jx + (rnd() - 0.5) * 7, jz + (rnd() - 0.5) * 7)
          continue
        }
      }
      const floors = 3 + Math.floor(district * 6 + rnd() * 3)
      const list = nr.dist < 60 ? near : far
      for (const [w, d] of [
        [7, 8],
        [5, 6],
        [3.6, 4],
      ]) {
        if (place(list, jx, jz, yaw, w, d, floors, nr.dist < FRONT + 16)) break
      }
    }
  }

  // --- Street trees ------------------------------------------------------------------------------------
  const treeClear = (x: number, z: number) => {
    const fp = Lots.make(x, z, 0, 0.8, 0.8)
    return !inClearing(x, z, 2) && !streetLots.some((s) => intersects(fp, s, 1))
  }
  // Along the avenue, on both sidewalks halfway between the lamps; none in front of the five
  // buildings the camera stops at.
  for (const side of [1, -1]) {
    const first = (side === 1 ? 13 : 6) - ROAD_LEAD_IN
    // Two trees between each pair of lamps (the lamps stand 14 units apart).
    for (let k = 0, d = first - 3; d < ROAD_LENGTH + ROAD_LEAD_OUT - 4; k++, d = first + Math.floor(k / 2) * 14 + (k % 2 ? 3 : -3)) {
      if (placements.some((pl) => Math.abs(pl.distance - d) < 11)) continue
      const f = roadFrame(d)
      const x = f.point.x + f.left.x * side * (ROAD_WIDTH / 2 + 1.35)
      const z = f.point.z + f.left.z * side * (ROAD_WIDTH / 2 + 1.35)
      if (!treeClear(x, z)) continue
      trees.push({ x, z, trunk: 2.1 + rnd() * 0.5, crown: 1.25 + rnd() * 0.35, tone: rnd() })
      // Planters either side of the tree.
      for (const off of [-1.5, 1.5]) {
        const g = roadFrame(d + off)
        const bx = g.point.x + g.left.x * side * (ROAD_WIDTH / 2 + 1.5)
        const bz = g.point.z + g.left.z * side * (ROAD_WIDTH / 2 + 1.5)
        if (treeClear(bx, bz)) trees.push({ x: bx, z: bz, trunk: 0.18, crown: 0.45 + rnd() * 0.15, tone: rnd() })
      }
    }
  }
  // Along the side streets near the avenue.
  for (const s of streets) {
    const ax = Math.sin(s.yaw)
    const az = Math.cos(s.yaw)
    for (let t = -s.length / 2 + 4; t < s.length / 2 - 3; t += 6) {
      for (const lat of [-2.25, 2.25]) {
        const x = s.x + ax * t + az * lat
        const z = s.z + az * t - ax * lat
        const dist = nearestRoad(x, z).dist
        if (dist < FRONT + 2 || dist > 140 || inClearing(x, z, 2) || rnd() < 0.05 || rnd() > density.greenery) continue
        trees.push({ x, z, trunk: 1.8 + rnd() * 0.6, crown: 1.0 + rnd() * 0.3, tone: rnd() })
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

  // --- Roof clutter: flat roofs are never empty ---------------------------------------------------------
  const rooftopBoxes: DetailBox[] = []
  const rooftopTanks: DetailBox[] = []
  {
    const key = (x: number, z: number, y: number) => `${x.toFixed(2)},${z.toFixed(2)},${y.toFixed(2)}`
    const tierBases = new Set<string>()
    for (const list of [near, far]) for (const b of list) if (b.y0 > 0) tierBases.add(key(b.x, b.z, b.y0))
    for (const list of [near, far]) {
      const isNear = list === near
      for (const b of list) {
        const top = b.y0 + b.h
        if (tierBases.has(key(b.x, b.z, top - PARAPET_HEIGHT)) || b.w < 4 || b.d < 4) continue
        if (!isNear && rnd() < 0.4) continue
        const cap = heightCap(b.x, b.z, Math.hypot(b.w, b.d) / 2)
        const c = Math.cos(b.yaw)
        const s = Math.sin(b.yaw)
        const at = (sx: number, sz: number): [number, number] => {
          const lx = (rnd() - 0.5) * Math.max(b.w - sx - 1.2, 0)
          const lz = (rnd() - 0.5) * Math.max(b.d - sz - 1.2, 0)
          return [b.x + lx * c + lz * s, b.z - lx * s + lz * c]
        }
        const items = Math.min(1 + Math.floor(rnd() * 3), Math.floor((b.w * b.d) / 18))
        let bulkhead = false
        for (let i = 0; i < items; i++) {
          const kind = rnd()
          if (kind < 0.3 && !bulkhead && b.style !== FACADE_STYLE.curtain) {
            // Stair and lift bulkhead.
            bulkhead = true
            const [sx, sy, sz] = [2 + rnd() * 1.2, 2.4 + rnd() * 0.6, 2.2 + rnd() * 1.4]
            if (top + sy > cap) continue
            const [x, z] = at(sx, sz)
            rooftopBoxes.push({ pos: [x, top + sy / 2, z], scale: [sx, sy, sz], yaw: b.yaw })
          } else if (kind < 0.45 && b.style !== FACADE_STYLE.curtain) {
            // Water tank.
            const r = 0.7 + rnd() * 0.4
            const hT = 1.6 + rnd() * 0.8
            if (top + hT + 0.4 > cap) continue
            const [x, z] = at(2 * r, 2 * r)
            rooftopTanks.push({ pos: [x, top + 0.4 + hT / 2, z], scale: [2 * r, hT, 2 * r], yaw: 0 })
            rooftopBoxes.push({ pos: [x, top + 0.2, z], scale: [2 * r + 0.2, 0.4, 2 * r + 0.2], yaw: b.yaw })
          } else {
            // Air-conditioning units, often in a row.
            const n = 1 + Math.floor(rnd() * 3)
            const [sx, sy, sz] = [1.1 + rnd() * 0.5, 0.8 + rnd() * 0.4, 0.9 + rnd() * 0.4]
            if (top + sy > cap) continue
            const [x, z] = at(sx * n + 0.3 * n, sz)
            for (let k = 0; k < n; k++) {
              const off = (k - (n - 1) / 2) * (sx + 0.3)
              rooftopBoxes.push({ pos: [x + off * c, top + sy / 2, z - off * s], scale: [sx, sy, sz], yaw: b.yaw })
            }
          }
        }
      }
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

  return {
    near,
    far,
    cornices,
    balconies,
    railings,
    awnings,
    pyramids,
    tower,
    experiences: placements,
    streets,
    crossings,
    parks,
    trees,
    rooftopBoxes,
    rooftopTanks,
  }
}

