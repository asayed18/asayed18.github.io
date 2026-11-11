import { useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { CanvasText, GroundText } from './CanvasText'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { ROAD_WIDTH } from './config'
import { parsePeriodMonths, monthsToHeight } from './period'
import { keepRendering, MAX_EASING_STEP } from './pacing'
import {
  applyFacade,
  createFacadeUniforms,
  setFacadeTheme,
  FACADE_STYLE,
  CITY_FLOOR_HEIGHT,
  PARAPET_HEIGHT,
  type FacadeStyle,
} from './facade'
import { useCityEnvironment } from './environment'
import { EXPERIENCE_LATERAL, ROAD_LENGTH, roadFrame } from './path'
import {
  generateCity,
  TOWER_HEIGHT,
  TOWER_SPHERE_AT,
  type BuildingSpec,
  type CityDensity,
  type DetailBox,
  type Pyramid,
} from './cityLayout'

const BUILDING_WIDTH = 5

/** Landmarks see through this share of the haze the city sees through (see fog.ts). */
const LANDMARK_FOG_SCALE = 0.62
const LANDMARK_DEFINES = { FOG_SCALE: LANDMARK_FOG_SCALE }

/**
 * The walls used to carry a displacement map. A box has no vertices inside its faces, so the map
 * could not add relief: it only pulled every face inwards by this constant amount (in units of
 * the box geometry) and cost a vertex-shader texture lookup plus extra shadow shader variants.
 * The inset is applied to the geometry instead, so nothing moves.
 */
const PLASTER_INSET = 0.0077

const UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1)

/** Facade of each experience building, in order along the road. */
const EXPERIENCE_STYLES: FacadeStyle[] = [
  FACADE_STYLE.punched,
  FACADE_STYLE.curtain,
  FACADE_STYLE.brick,
  FACADE_STYLE.ribbon,
  FACADE_STYLE.ribbon,
]

/** City size per performance tier: the skyline grid spacing and how far out it reaches. */
const DENSITY: Record<PerfPreset['tier'], CityDensity> = {
  low: { lotsPerBlock: 2, skylineReach: 160 },
  medium: { lotsPerBlock: 2, skylineReach: 205 },
  high: { lotsPerBlock: 3, skylineReach: 240 },
}

/** Any number of boxes sharing one material, in a single draw. */
const BoxInstances = memo(function BoxInstances({
  boxes,
  material,
  castShadow = false,
}: {
  boxes: DetailBox[]
  material: THREE.Material
  castShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    boxes.forEach((box, i) => {
      dummy.position.set(...box.pos)
      dummy.rotation.set(0, box.yaw, box.rotZ ?? 0)
      dummy.scale.set(...box.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [boxes])
  if (boxes.length === 0) return null
  return (
    <instancedMesh
      key={boxes.length}
      ref={ref}
      args={[UNIT_BOX_GEOMETRY, material, boxes.length]}
      castShadow={castShadow}
      receiveShadow
    />
  )
})

/** One instanced draw for a whole district of blocks, each with its own facade. */
const CityBlocks = memo(function CityBlocks({
  specs,
  material,
  castShadow,
}: {
  specs: BuildingSpec[]
  material: THREE.Material
  castShadow: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)
  // Own geometry: it carries one facade description per instance (the shader's `aFacade`).
  const geometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    const facade = new Float32Array(specs.length * 3)
    specs.forEach((b, i) => facade.set([b.floorH, b.bay, b.style], i * 3))
    g.setAttribute('aFacade', new THREE.InstancedBufferAttribute(facade, 3))
    return g
  }, [specs])
  useEffect(() => () => geometry.dispose(), [geometry])

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    const color = new THREE.Color()
    specs.forEach((b, i) => {
      dummy.position.set(b.x, b.y0 + b.h / 2, b.z)
      dummy.rotation.set(0, b.yaw, 0)
      dummy.scale.set(b.w, b.h, b.d).multiplyScalar(1 - 2 * PLASTER_INSET)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.setRGB(b.color[0], b.color[1], b.color[2]))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [specs])

  if (specs.length === 0) return null
  return (
    <instancedMesh
      key={specs.length}
      ref={ref}
      args={[geometry, material, specs.length]}
      castShadow={castShadow}
      receiveShadow
    />
  )
})

interface BuildingsProps {
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
}

/**
 * The Giza pyramids: a square base 1.57 times the height, in weathered limestone. At night they are
 * floodlit, as they are for real.
 */
const GizaPyramids = memo(function GizaPyramids({ pyramids, theme }: { pyramids: Pyramid[]; theme: Theme }) {
  const isLight = theme === 'light'
  // Courses of weathered limestone blocks, painted once on a canvas.
  const stone = useMemo(() => {
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#bdbdbd'
    ctx.fillRect(0, 0, size, size)
    const courses = 48
    for (let i = 0; i < courses; i++) {
      const y = (i / courses) * size
      ctx.fillStyle = `rgba(0,0,0,${0.22 + 0.15 * Math.abs(Math.sin(i * 7.3))})`
      ctx.fillRect(0, y, size, 1.2)
      // Block joints and wear along the course.
      for (let x = 0; x < size; x += 6 + ((i * 13 + x) % 7)) {
        ctx.fillStyle = `rgba(${(x * 31 + i * 17) % 2 ? '255,255,255' : '0,0,0'},${0.04 + ((x * 7 + i) % 5) * 0.015})`
        ctx.fillRect(x, y + 1.2, 6, size / courses - 1.2)
      }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return texture
  }, [])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.95, map: stone })
    // Seen through less haze than the city, so they stay half-visible far away.
    m.defines = { FOG_SCALE: LANDMARK_FOG_SCALE }
    return m
  }, [stone])
  const sand = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 1 }), [])
  useLayoutEffect(() => {
    material.color.set(isLight ? '#d2bd98' : '#6a5a44')
    material.emissive.set(isLight ? '#000000' : '#2a2117')
    material.emissiveMap = isLight ? null : stone
    material.needsUpdate = true
    sand.color.set(isLight ? '#d9c9a8' : '#17130e')
  }, [isLight, material, sand, stone])
  useEffect(
    () => () => {
      material.dispose()
      sand.dispose()
      stone.dispose()
    },
    [material, sand, stone]
  )
  const cone = useMemo(() => new THREE.ConeGeometry(1, 1, 4, 1), [])
  useEffect(() => () => cone.dispose(), [cone])
  const centre = useMemo(() => {
    const c = { x: 0, z: 0, r: 0 }
    pyramids.forEach((p) => {
      c.x += p.x / pyramids.length
      c.z += p.z / pyramids.length
    })
    pyramids.forEach((p) => (c.r = Math.max(c.r, Math.hypot(p.x - c.x, p.z - c.z) + p.radius * 1.4)))
    return c
  }, [pyramids])

  if (pyramids.length === 0) return null
  return (
    <group>
      {/* The plateau: bare sand instead of paving. */}
      <mesh position={[centre.x, -0.04, centre.z]} rotation={[-Math.PI / 2, 0, 0]} material={sand} receiveShadow>
        <circleGeometry args={[centre.r, 48]} />
      </mesh>
      {pyramids.map((p, i) => (
        <mesh
          key={i}
          geometry={cone}
          material={material}
          position={[p.x, p.height / 2, p.z]}
          rotation={[0, p.yaw, 0]}
          scale={[p.radius, p.height, p.radius]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  )
})

/** The Berlin Fernsehturm: concrete shaft, the steel sphere with its window band, the antenna. */
const BerlinTVTower = memo(function BerlinTVTower({ x, z, theme }: { x: number; z: number; theme: Theme }) {
  const isLight = theme === 'light'
  const H = TOWER_HEIGHT
  const sphereY = H * TOWER_SPHERE_AT
  const sphereR = 5.4
  const shaftTop = sphereY - sphereR * 0.6
  const antennaBase = sphereY + sphereR + 7

  const concrete = isLight ? '#b9b4ac' : '#4c4944'
  const steel = isLight ? '#c3cad0' : '#66707a'
  const nightGlow = isLight ? '#000000' : '#1c1f24'

  return (
    <group position={[x, 0, z]}>
      {/* Base, flaring out to the ground. */}
      <mesh position={[0, 4, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[2.3, 4.2, 8, 24]} />
        <meshStandardMaterial defines={LANDMARK_DEFINES} color={concrete} emissive={nightGlow} roughness={0.85} />
      </mesh>
      <mesh position={[0, 8 + (shaftTop - 8) / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.45, 2.3, shaftTop - 8, 24]} />
        <meshStandardMaterial defines={LANDMARK_DEFINES} color={concrete} emissive={nightGlow} roughness={0.85} />
      </mesh>
      <mesh position={[0, sphereY, 0]} castShadow receiveShadow>
        <sphereGeometry args={[sphereR, 32, 24]} />
        <meshStandardMaterial defines={LANDMARK_DEFINES} color={steel} emissive={nightGlow} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* Window band of the restaurant and the viewing deck, lit at night. */}
      <mesh position={[0, sphereY - sphereR * 0.18, 0]}>
        <cylinderGeometry args={[sphereR * 1.005, sphereR * 0.97, 1.5, 32, 1, true]} />
        <meshStandardMaterial
          defines={LANDMARK_DEFINES}
          color={isLight ? '#3a3a3a' : '#111111'}
          emissive="#f6d6a2"
          emissiveIntensity={isLight ? 0 : 1.4}
          roughness={0.2}
          metalness={0.5}
        />
      </mesh>
      {/* Upper shaft and antenna, in bands. */}
      <mesh position={[0, (sphereY + antennaBase) / 2, 0]}>
        <cylinderGeometry args={[0.9, 1.2, antennaBase - sphereY, 16]} />
        <meshStandardMaterial defines={LANDMARK_DEFINES} color={concrete} emissive={nightGlow} roughness={0.8} />
      </mesh>
      {Array.from({ length: 6 }, (_, i) => {
        const len = (H - antennaBase) / 6
        return (
          <mesh key={i} position={[0, antennaBase + len * (i + 0.5), 0]}>
            <cylinderGeometry args={[0.5 - i * 0.06, 0.56 - i * 0.06, len, 8]} />
            <meshStandardMaterial defines={LANDMARK_DEFINES} color={i % 2 ? (isLight ? '#e8e8e8' : '#777777') : isLight ? '#555555' : '#2c2c2c'} roughness={0.6} />
          </mesh>
        )
      })}
      {/* Aviation light on the tip: marks the tower against the night sky. */}
      <mesh position={[0, H + 0.3, 0]}>
        <sphereGeometry args={[0.45, 8, 6]} />
        <meshBasicMaterial color={isLight ? '#555555' : '#ffffff'} toneMapped={false} />
      </mesh>
    </group>
  )
})

const Logo3D = memo(function Logo3D({
  logoUrl,
  isActive,
  theme,
  parentYaw,
}: {
  logoUrl: string
  isActive: boolean
  theme: Theme
  /** Rotation of the group the sign stands in, so it can turn to face the camera. */
  parentYaw: number
}) {
  const isLight = theme === 'light'
  const texture = useTexture(logoUrl)
  const groupRef = useRef<THREE.Group>(null)

  useMemo(() => {
    const img = texture.image
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data
    // White silhouette of the logo (its shape comes from the alpha channel): every logo then
    // glows the same way on the dark lightbox, whatever its original colours.
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
    }
    ctx.putImageData(imageData, 0, 0)
    texture.image = canvas
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
  }, [texture])

  const aspect = texture.image ? texture.image.width / texture.image.height : 2

  // A backlit lightbox, as on real office towers: a dark panel with the logo glowing on it,
  // readable at night and in daylight, and brighter while the building is in focus.
  const signWidth = BUILDING_WIDTH * 0.95
  const signHeight = signWidth / Math.min(aspect, 3)
  const depth = 0.3
  const poleHeight = 1.8
  const signBaseY = poleHeight + signHeight / 2 + 0.1

  const worldPos = useRef(new THREE.Vector3())

  useFrame((state) => {
    if (!groupRef.current) return

    groupRef.current.getWorldPosition(worldPos.current)
    const dz = state.camera.position.z - worldPos.current.z
    const dx = state.camera.position.x - worldPos.current.x
    if (dx * dx + dz * dz > 70 * 70) return

    const t = state.clock.elapsedTime
    groupRef.current.position.y = signBaseY + Math.sin(t * 0.8) * 0.08
    groupRef.current.rotation.y = Math.atan2(dx, dz) - parentYaw
  })

  const glow = isActive ? (isLight ? 1.1 : 1.6) : isLight ? 0.75 : 0.9
  const face = (
    <meshStandardMaterial
      map={texture}
      emissiveMap={texture}
      emissive="#ffffff"
      emissiveIntensity={glow}
      color="#ffffff"
      transparent
      roughness={0.6}
      depthTest={false}
      toneMapped={false}
    />
  )

  return (
    <group>
      {[-0.6, 0.6].map((px) => (
        <mesh key={px} position={[px, poleHeight / 2, 0]}>
          <cylinderGeometry args={[0.07, 0.1, poleHeight, 6]} />
          <meshStandardMaterial color={isLight ? '#666666' : '#2a2a2a'} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      <group ref={groupRef} renderOrder={10}>
        <mesh castShadow renderOrder={10}>
          <boxGeometry args={[signWidth + 0.4, signHeight + 0.4, depth]} />
          <meshStandardMaterial
            color={isLight ? '#1e1e1e' : '#0c0c0c'}
            emissive="#ffffff"
            emissiveIntensity={isActive ? 0.06 : 0.02}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>

        <mesh position={[0, 0, depth / 2 + 0.005]} renderOrder={11}>
          <planeGeometry args={[signWidth, signHeight]} />
          {face}
        </mesh>
        <mesh position={[0, 0, -(depth / 2 + 0.005)]} rotation={[0, Math.PI, 0]} renderOrder={11}>
          <planeGeometry args={[signWidth, signHeight]} />
          {face}
        </mesh>
      </group>
    </group>
  )
})

const RoadDateMarking = memo(function RoadDateMarking({
  period,
  isActive,
  theme,
}: {
  period: string
  isActive: boolean
  theme: Theme
}) {
  const isLight = theme === 'light'
  const joinDate = period.split('–')[0].trim()

  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-4.5, 0, 0]}>
        <planeGeometry args={[2, 0.14]} />
        <meshStandardMaterial
          color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#777777' : '#555555')}
          transparent
          opacity={isActive ? 0.9 : 0.4}
          depthTest={false}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[4.5, 0, 0]}>
        <planeGeometry args={[2, 0.14]} />
        <meshStandardMaterial
          color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#777777' : '#555555')}
          transparent
          opacity={isActive ? 0.9 : 0.4}
          depthTest={false}
        />
      </mesh>

      <GroundText
        rotation={[-Math.PI / 2, 0, Math.PI]}
        fontSize={0.9}
        color={isActive ? (isLight ? '#343434' : '#5a5a5a') : (isLight ? '#888888' : '#666666')}
      >
        {joinDate}
      </GroundText>
    </group>
  )
})

const ExperienceBuilding = memo(function ExperienceBuilding({
  x,
  width,
  height,
  depth,
  numFloors,
  startYear,
  isActive,
  isLight,
  style,
}: {
  style: FacadeStyle
  x: number
  width: number
  height: number
  depth: number
  numFloors: number
  startYear: number
  isActive: boolean
  isLight: boolean
}) {
  const floorHeight = height / numFloors

  const ledgeYs = useMemo(() => {
    const result: number[] = []
    for (let floor = 1; floor < numFloors; floor++) {
      result.push(floor * floorHeight)
    }
    return result
  }, [numFloors, floorHeight])

  const envMap = useCityEnvironment()

  // The windows are painted by the facade shader, one storey per year of the role.
  const facade = useMemo(() => createFacadeUniforms(), [])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.03 })
    applyFacade(m, facade)
    return m
  }, [facade])
  useEffect(() => () => material.dispose(), [material])

  // In focus: a step brighter than its neighbours, never blown out to pure white.
  const bodyColor = isActive ? (isLight ? '#e9dfcf' : '#6e665c') : (isLight ? '#d3cbbf' : '#1a1815')
  const bodyEmissive = isActive ? (isLight ? '#000000' : '#221e19') : '#000000'
  const labelColor = isActive ? (isLight ? '#e8e8e8' : '#c0c0c0') : (isLight ? '#cccccc' : '#5a5a5a')
  const ledgeColor = isActive ? (isLight ? '#f2ece2' : '#4d4740') : (isLight ? '#d8d1c6' : '#1d1b18')

  useLayoutEffect(() => {
    material.envMap = envMap
    material.envMapIntensity = isLight ? 0.5 : 0.45
    material.color.set(bodyColor)
    material.emissive.set(bodyEmissive)
    material.emissiveIntensity = isActive ? 0.1 : 0
    facade.uHalf.value.set(width / 2 - PLASTER_INSET, height / 2 - PLASTER_INSET, depth / 2 - PLASTER_INSET)
    // Real storeys (several per year of the role); the ledges still mark the years.
    facade.uFloorH.value = (height - PARAPET_HEIGHT) / Math.max(Math.round((height - PARAPET_HEIGHT) / CITY_FLOOR_HEIGHT), 1)
    facade.uColW.value = style === FACADE_STYLE.curtain ? 1.25 : 1.15
    facade.uStyle.value = style
    setFacadeTheme(facade, isLight, isActive)
  }, [material, facade, envMap, isLight, isActive, bodyColor, bodyEmissive, width, height, depth, style])

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]} material={material} castShadow receiveShadow>
        <boxGeometry
          args={[width - 2 * PLASTER_INSET, height - 2 * PLASTER_INSET, depth - 2 * PLASTER_INSET]}
        />
      </mesh>

      {ledgeYs.map((y, i) => (
        <mesh
          key={`l-${i}`}
          position={[0, y, 0]}
          geometry={UNIT_BOX_GEOMETRY}
          scale={[width + 0.08, 0.06, depth + 0.08]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={ledgeColor} />
        </mesh>
      ))}

      {Array.from({ length: numFloors }, (_, floor) => {
        const facingRoad = x > 0 ? -1 : 1
        const labelX = facingRoad * (width / 2 + 0.03)
        const labelZ = depth / 2 - 0.9
        const rotY = facingRoad > 0 ? Math.PI / 2 : -Math.PI / 2

        return (
          <group key={`yr-${floor}`} position={[labelX, floor * floorHeight + floorHeight * 0.75, labelZ]}>
            <CanvasText
              position={[0, 0, 0]}
              rotation={[0, rotY, 0]}
              scale={[1, 1, 1]}
              fontSize={floorHeight * 0.12}
              color={labelColor}
              opacity={isActive ? 1 : 0.8}
              anchorX={facingRoad > 0 ? 'right' : 'left'}
              anchorY="bottom"
              depthTest={false}
              renderOrder={10}
            >
              {String(startYear + floor)}
            </CanvasText>
          </group>
        )
      })}
    </group>
  )
})

interface ActiveBuilding {
  x: number
  z: number
  yaw: number
  /** +1 left of the road, -1 right. */
  side: number
  buildingHeight: number
}

/** Below this intensity the front light is too dim for a stale shadow map to be noticed. */
const SHADOW_MIN_INTENSITY = 0.05

function ActiveLights({
  active,
  isLight,
  enableShadows,
}: {
  active: ActiveBuilding | undefined
  isLight: boolean
  enableShadows: boolean
}) {
  const gl = useThree((state) => state.gl)
  const groupRef = useRef<THREE.Group>(null)
  const topLightRef = useRef<THREE.PointLight>(null)
  const frontLightRef = useRef<THREE.PointLight>(null)
  const logoLightRef = useRef<THREE.PointLight>(null)

  // Where the front light stood when its shadow map was last rendered.
  const bakedAt = useRef(new THREE.Vector3(NaN, NaN, NaN))
  const worldPosition = useRef(new THREE.Vector3())

  useEffect(() => {
    const canvas = gl.domElement
    const forget = () => bakedAt.current.set(NaN, NaN, NaN)
    canvas.addEventListener('webglcontextrestored', forget)
    return () => canvas.removeEventListener('webglcontextrestored', forget)
  }, [gl])

  useFrame((state, delta) => {
    const group = groupRef.current
    if (!group) return
    const targetX = active ? active.x : 0
    const targetZ = active ? active.z : 0

    // Clamped so a long frame (tab switch, shader compile) cannot overshoot the target.
    const k = Math.min(5 * Math.min(delta, MAX_EASING_STEP), 1)

    // Smooth position interpolation
    group.position.x += (targetX - group.position.x) * k
    group.position.z += (targetZ - group.position.z) * k
    if (active) {
      // Turn the shortest way round to the building's orientation.
      const turn = Math.atan2(Math.sin(active.yaw - group.rotation.y), Math.cos(active.yaw - group.rotation.y))
      group.rotation.y += turn * k
    }

    // Smooth intensity interpolation
    const targetIntensityTop = active ? (isLight ? 3 : 0.9) : 0
    const targetIntensityFront = active ? (isLight ? 14 : 45) : 0
    const targetIntensityLogo = active ? (isLight ? 2 : 4) : 0

    if (topLightRef.current) topLightRef.current.intensity += (targetIntensityTop - topLightRef.current.intensity) * k
    if (logoLightRef.current) logoLightRef.current.intensity += (targetIntensityLogo - logoLightRef.current.intensity) * k

    const front = frontLightRef.current
    if (front) {
      front.intensity += (targetIntensityFront - front.intensity) * k

      // The front light is by far the brightest of the three and all of them ease at the same
      // rate, so it tells when the fade is over: keep frames coming until it is within 1% of its
      // target and the group has arrived.
      const fading = Math.abs(targetIntensityFront - front.intensity) > 0.01 * Math.max(targetIntensityFront, 1)
      const travelling = Math.abs(targetX - group.position.x) > 0.01 || Math.abs(targetZ - group.position.z) > 0.01
      if (fading || travelling) keepRendering(state)

      // A point-light shadow costs six passes over the scene. Render it only while the light is
      // on and has moved since the last time; three.js would otherwise redo it every frame, even
      // while the light is off between two buildings.
      if (front.castShadow) {
        front.shadow.autoUpdate = false
        if (front.intensity > SHADOW_MIN_INTENSITY) {
          front.getWorldPosition(worldPosition.current)
          const moved = !(worldPosition.current.distanceToSquared(bakedAt.current) < 1e-8)
          if (moved) {
            front.shadow.needsUpdate = true
            bakedAt.current.copy(worldPosition.current)
          }
        }
      }
    }
  })

  // Fixed values to avoid erratic shadow/camera updates
  const height = active ? active.buildingHeight : 10
  const side = active ? active.side : 1

  return (
    <group ref={groupRef}>
      {/* The top and logo lights cast no shadow: they sit right above the roof, so their shadows
          only fall on surfaces these weak lights barely reach, and each one cost six passes per
          frame plus a shadow lookup in every lit pixel. */}
      <pointLight
        ref={topLightRef}
        position={[0, height + 3, 0]}
        color={'#ffffff'}
        intensity={0}
      />
      <pointLight
        ref={frontLightRef}
        position={[-side * 5.5, height * 0.5, 0]}
        color={'#ffffff'}
        intensity={0}
        castShadow={enableShadows}
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-bias={-0.05}
        shadow-camera-near={0.9}
        shadow-camera-far={12}
      />
      <pointLight
        ref={logoLightRef}
        position={[0, height + 1.5, 0]}
        color={'#ffffff'}
        intensity={0}
        distance={12}
      />
    </group>
  )
}

export function Buildings({ experiences, activeExperienceId, theme, perf }: BuildingsProps) {
  const isLight = theme === 'light'
  const city = useMemo(() => generateCity(experiences, DENSITY[perf.tier]), [experiences, perf.tier])

  const envMap = useCityEnvironment()
  const facade = useMemo(() => createFacadeUniforms(), [])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ envMap, roughness: 0.9, metalness: 0.05 })
    applyFacade(m, facade)
    return m
  }, [envMap, facade])

  const ledgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85 }), [])
  const railingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 }), [])
  const awningMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide }), [])

  // Theme colours are plain uniforms: set them without flagging the materials for a rebuild.
  // Layout effect so they are in place before the first frame.
  useLayoutEffect(() => {
    material.color.set(isLight ? '#d2d2d2' : '#3a3a3a')
    ledgeMaterial.color.set(isLight ? '#e2ddd4' : '#35322e')
    railingMaterial.color.set(isLight ? '#8a8a8a' : '#202020')
    awningMaterial.color.set(isLight ? '#8f6f62' : '#2a211d')
    material.envMapIntensity = isLight ? 0.8 : 0.35
    setFacadeTheme(facade, isLight)
  }, [isLight, material, ledgeMaterial, railingMaterial, awningMaterial, facade])

  const expRenderData = useMemo(
    () =>
      experiences.map((exp, index) => {
        const placement = city.experiences[index]
        const frame = roadFrame(placement.distance)
        const x = placement.side * EXPERIENCE_LATERAL
        const months = parsePeriodMonths(exp.period)
        const buildingHeight = monthsToHeight(months)
        const numFloors = Math.max(Math.ceil(months / 12), 1)
        const startYear = parseInt(exp.period.split('–')[0].trim().split(' ')[1])
        return {
          exp,
          index,
          x,
          buildingHeight,
          numFloors,
          startYear,
          origin: [frame.point.x, 0, frame.point.z] as [number, number, number],
          yaw: frame.yaw,
          world: { x: placement.x, z: placement.z, yaw: frame.yaw, side: placement.side, buildingHeight },
        }
      }),
    [experiences, city]
  )

  // Timeline ticks painted along the road, one every 1.5 units, except at the join dates.
  const tickSpacing = 1.5
  const tickWidth = 1.2
  const tickX = ROAD_WIDTH * 0.25
  const timelineTicks = useMemo(() => {
    const count = Math.floor(ROAD_LENGTH / tickSpacing)
    const dates = city.experiences.map((p) => p.distance)
    const ticks: number[] = []
    for (let i = 0; i < count; i++) {
      const d = i * tickSpacing
      if (!dates.some((ed) => Math.abs(d - ed) < 1)) ticks.push(d)
    }
    return ticks
  }, [city])

  const tickGeometry = useMemo(() => new THREE.PlaneGeometry(tickWidth, 0.06), [])
  const tickMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, depthWrite: false }),
    []
  )
  const tickRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    tickMaterial.color.set(isLight ? '#161616' : '#555555')
  }, [isLight, tickMaterial])

  useEffect(
    () => () => {
      material.dispose()
      ledgeMaterial.dispose()
      railingMaterial.dispose()
      awningMaterial.dispose()
      tickMaterial.dispose()
      tickGeometry.dispose()
    },
    [material, ledgeMaterial, railingMaterial, awningMaterial, tickMaterial, tickGeometry]
  )

  useLayoutEffect(() => {
    const mesh = tickRef.current
    if (!mesh || timelineTicks.length === 0) return
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(tickX, 0.01, 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
      new THREE.Vector3(1, 1, 1)
    )
    const m = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < timelineTicks.length; i++) {
      const f = roadFrame(timelineTicks[i])
      m.makeRotationAxis(up, f.yaw).setPosition(f.point).multiply(local)
      mesh.setMatrixAt(i, m)
    }
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [timelineTicks, tickX])

  return (
    <group>
      {timelineTicks.length > 0 && (
        <instancedMesh ref={tickRef} args={[tickGeometry, tickMaterial, timelineTicks.length]} renderOrder={1} />
      )}

      {/* The blocks near the road cast shadows; the skyline is too far away for them to show. */}
      <CityBlocks specs={city.near} material={material} castShadow />
      <CityBlocks specs={city.far} material={material} castShadow={false} />

      <BoxInstances boxes={city.cornices} material={ledgeMaterial} castShadow />
      <BoxInstances boxes={city.balconies} material={ledgeMaterial} castShadow />
      <BoxInstances boxes={city.railings} material={railingMaterial} />
      <BoxInstances boxes={city.awnings} material={awningMaterial} castShadow />

      <GizaPyramids pyramids={city.pyramids} theme={theme} />
      {city.tower && <BerlinTVTower x={city.tower.x} z={city.tower.z} theme={theme} />}

      {expRenderData.map(({ exp, index, x, buildingHeight, numFloors, startYear, origin, yaw }) => {
        const isActive = exp.id === activeExperienceId

        return (
          <group key={exp.id} position={origin} rotation={[0, yaw, 0]}>
            <ExperienceBuilding
              x={x}
              width={5}
              height={buildingHeight}
              depth={5}
              numFloors={numFloors}
              startYear={startYear}
              isActive={isActive}
              isLight={isLight}
              style={EXPERIENCE_STYLES[index % EXPERIENCE_STYLES.length]}
            />
            {exp.logo && (
              <group position={[x, buildingHeight, 0]}>
                <Logo3D logoUrl={exp.logo} isActive={isActive} theme={theme} parentYaw={yaw} />
              </group>
            )}
            <RoadDateMarking period={exp.period} isActive={isActive} theme={theme} />
          </group>
        )
      })}

      <ActiveLights
        active={expRenderData.find((d) => d.exp.id === activeExperienceId)?.world}
        isLight={isLight}
        enableShadows={perf.buildingShadows}
      />
    </group>
  )
}
