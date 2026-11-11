import { useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { CanvasText, GroundText } from './CanvasText'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { ROAD_WIDTH, BACKGROUND_SIDE_OFFSET, SIDEWALK_WIDTH } from './config'
import { parsePeriodMonths, monthsToHeight } from './period'
import { useStaticShadow } from './shadows'
import { keepRendering, MAX_EASING_STEP } from './pacing'
import {
  applyFacade,
  createFacadeUniforms,
  setFacadeTheme,
  facadeBays,
  FACADE_STYLE,
  CITY_FLOOR_HEIGHT,
  PARAPET_HEIGHT,
  type FacadeStyle,
} from './facade'
import { useCityEnvironment } from './environment'

const SIDE_OFFSET = BACKGROUND_SIDE_OFFSET
const BUILDING_WIDTH = 5

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
  FACADE_STYLE.curtain,
]

interface Box {
  pos: [number, number, number]
  scale: [number, number, number]
  /** Tilt around the z axis (awnings). */
  rotZ?: number
}

/** Any number of boxes sharing one material, in a single draw. */
const BoxInstances = memo(function BoxInstances({
  boxes,
  material,
  castShadow = false,
}: {
  boxes: Box[]
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
      dummy.rotation.set(0, 0, box.rotZ ?? 0)
      dummy.scale.set(...box.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [boxes])
  if (boxes.length === 0) return null
  return (
    <instancedMesh
      key={boxes.length}
      ref={ref}
      args={[UNIT_BOX_GEOMETRY, material, boxes.length]}
      castShadow={castShadow}
      receiveShadow
      frustumCulled={false}
    />
  )
})

interface BuildingsProps {
  roadLength: number
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
}

/* Giza Pyramids landmark (far behind the first experience building) */
const GizaPyramids = memo(function GizaPyramids({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  // Moonlit stone at night: dark, but clearly lighter than the night sky behind it.
  const stoneColor = isLight ? '#222222' : '#3a3a3a'
  const stoneEmissive = isLight ? '#111111' : '#1c1c1c'

  const pyramids: { x: number; z: number; height: number; radius: number }[] = [
    { x: 50, z: -59, height: 20, radius: 20 },
    { x: 55, z: -20, height: 35, radius: 35 },
  ]

  return (
    <group>
      {pyramids.map((p, i) => (
        <mesh
          key={`pyramid-${i}`}
          position={[p.x + 20, p.height / 2, p.z + 60]}
          rotation={[0, Math.PI / 4, 0]}
          castShadow
          receiveShadow
        >
          <coneGeometry args={[p.radius, p.height, 4]} />
          <meshStandardMaterial
            color={stoneColor}
            emissive={stoneEmissive}
            emissiveIntensity={0.5}
            flatShading
          />
        </mesh>
      ))}
    </group>
  )
})

/* Berlin Fernsehturm (TV Tower) landmark behind the fifth experience */
const BerlinTVTower = memo(function BerlinTVTower({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  const towerColor = isLight ? '#333333' : '#3a3a3a'
  const towerEmissive = isLight ? '#222222' : '#1e1e1e'

  const shaftHeight = 40
  const shaftRadiusBottom = 2.2
  const shaftRadiusTop = 1.1
  const sphereRadius = 6
  const sphereY = shaftHeight * 0.72
  const antennaHeight = 16
  const antennaY = sphereY + sphereRadius + antennaHeight / 2

  const towerX = 30
  const towerZ = 40

  return (
    <group position={[towerX, 0, towerZ]}>
      <mesh position={[0, shaftHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[shaftRadiusTop, shaftRadiusBottom, shaftHeight, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      <mesh position={[0, sphereY, 0]} castShadow receiveShadow>
        <sphereGeometry args={[sphereRadius, 10, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      <mesh position={[0, sphereY - sphereRadius * 0.7, 0]}>
        <cylinderGeometry args={[3.8, 3, 2.2, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Aviation light on the tip: marks the tower against the night sky. */}
      <mesh position={[0, antennaY + antennaHeight / 2 + 0.3, 0]}>
        <sphereGeometry args={[0.45, 8, 6]} />
        <meshBasicMaterial color={isLight ? '#555555' : '#ffffff'} toneMapped={false} />
      </mesh>

      <mesh position={[0, antennaY, 0]}>
        <cylinderGeometry args={[0.15, 0.4, antennaHeight, 6]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  )
})

const Logo3D = memo(function Logo3D({
  logoUrl,
  isActive,
  theme,
}: {
  logoUrl: string
  isActive: boolean
  theme: Theme
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
    if (Math.abs(dz) > 50) return

    const t = state.clock.elapsedTime
    groupRef.current.position.y = signBaseY + Math.sin(t * 0.8) * 0.08

    const dx = state.camera.position.x - worldPos.current.x
    groupRef.current.rotation.y = Math.atan2(dx, dz)
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
  const bodyColor = isActive ? (isLight ? '#d2d2d2' : '#666666') : (isLight ? '#bcbcbc' : '#111111')
  const bodyEmissive = isActive ? (isLight ? '#000000' : '#222222') : '#000000'
  const labelColor = isActive ? (isLight ? '#e8e8e8' : '#c0c0c0') : (isLight ? '#cccccc' : '#5a5a5a')
  const ledgeColor = isActive ? (isLight ? '#eeeeee' : '#4a4a4a') : (isLight ? '#cdcdcd' : '#1a1a1a')

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

    // Smooth intensity interpolation
    const targetIntensityTop = active ? (isLight ? 3 : 0.9) : 0
    const targetIntensityFront = active ? (isLight ? 20.5 : 100) : 0
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
  const x = active ? active.x : 10

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
        position={[(x > 0 ? -1 : 1) * 5.5, height * 0.5, 0]}
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

export function Buildings({ roadLength, experiences, activeExperienceId, theme, perf }: BuildingsProps) {
  const isLight = theme === 'light'
  const instancedRef = useRef<THREE.InstancedMesh>(null)
  const city = useMemo(() => {
    const positions: [number, number, number][] = []
    const scales: [number, number, number][] = []
    /** Per building: storey height, bay width, facade style (the shader's `aFacade`). */
    const params: [number, number, number][] = []
    /** Per building: brightness multiplier of the wall colour. */
    const tones: number[] = []
    const seed = 12345
    const rand = (i: number) => {
      const x = Math.sin(seed + i * 0.1) * 10000
      return x - Math.floor(x)
    }

    // Keep a clear plaza around each experience building and the pyramids, so the city never
    // hides them from the camera.
    const MARGIN = 0.01
    const zones = experiences.map((exp, index) => {
      const side = index % 2 === 0 ? 1 : -1
      return { x: side * (ROAD_WIDTH / 2 + SIDE_OFFSET), z: exp.position * roadLength, hw: 4.5, hd: 6 }
    })
    const pyramidZ = experiences[0] ? experiences[0].position * roadLength : 0
    zones.push({ x: 50, z: pyramidZ, hw: 18, hd: 25 })

    const overlaps = (cx: number, cz: number, hw: number, hd: number) => {
      for (const zone of zones) {
        if (Math.abs(cx - zone.x) < hw + zone.hw + MARGIN && Math.abs(cz - zone.z) < hd + zone.hd + MARGIN) return true
      }
      for (let j = 0; j < positions.length; j++) {
        const [px, , pz] = positions[j]
        const [sw, , sd] = scales[j]
        if (Math.abs(cx - px) < hw + sw / 2 + MARGIN && Math.abs(cz - pz) < hd + sd / 2 + MARGIN) return true
      }
      return false
    }

    // Sight lines to the landmarks: from the LDC building on, the pyramids rise behind low
    // buildings on that side; from the Babbel building on, the TV tower stays clear.
    const ldcZ = experiences[0] ? experiences[0].position * roadLength : -1000
    const babbelZ = experiences[4] ? experiences[4].position * roadLength : -1000
    /** Most storeys allowed at a spot (Infinity = no limit). */
    const maxFloors = (x: number, z: number, frontage: boolean) => {
      if (x > 0 && z > ldcZ - 25 && z < ldcZ + 85) return frontage ? 3 : x < 45 ? 3 : 0
      if (x > 0 && z > babbelZ - 10 && z < babbelZ + 60 && x < 60) return frontage ? Infinity : 4
      return Infinity
    }

    const pickStyle = (r: number, tall: boolean): FacadeStyle => {
      if (tall) return r < 0.45 ? FACADE_STYLE.curtain : r < 0.75 ? FACADE_STYLE.ribbon : FACADE_STYLE.punched
      return r < 0.4 ? FACADE_STYLE.punched : r < 0.75 ? FACADE_STYLE.brick : FACADE_STYLE.ribbon
    }
    const bayWidth = (style: FacadeStyle, r: number) =>
      style === FACADE_STYLE.brick ? 1.05 + 0.2 * r : style === FACADE_STYLE.curtain ? 1.3 : 1.25 + 0.35 * r

    const add = (x: number, z: number, w: number, h: number, d: number, style: FacadeStyle, r: number) => {
      positions.push([x, h / 2, z])
      scales.push([w, h, d])
      params.push([CITY_FLOOR_HEIGHT, bayWidth(style, r), style])
      tones.push(style === FACADE_STYLE.curtain ? 0.8 + 0.3 * r : 0.72 + 0.5 * rand(r * 9000 + 17))
    }

    // Street wall: buildings side by side along the sidewalk, as on a real street, with the
    // occasional alley between them.
    const frontX = ROAD_WIDTH / 2 + SIDEWALK_WIDTH
    let n = 0
    for (const side of [-1, 1]) {
      let z = -2
      while (z < roadLength + 6) {
        const r = rand(n * 13 + 31)
        const d = 4.2 + rand(n * 13 + 32) * 3.5
        const w = 5 + rand(n * 13 + 33) * 3
        const cz = z + d / 2
        const cx = side * (frontX + w / 2)
        const floors = Math.min(3 + Math.floor(rand(n * 13 + 34) * 4), maxFloors(cx, cz, true))
        const h = CITY_FLOOR_HEIGHT * floors + PARAPET_HEIGHT
        if (!overlaps(cx, cz, w / 2, d / 2)) add(cx, cz, w, h, d, pickStyle(r, false), rand(n * 13 + 35))
        z += d + (rand(n * 13 + 36) < 0.15 ? 1.6 : 0.02)
        n++
      }
    }

    // Blocks behind the street wall, rising to towers towards the edge of the city.
    const bCount = perf.buildingCount
    const rows = [
      { count: bCount, xMin: 15, xRange: 4, wMin: 4, wRange: 4, dMin: 4, dRange: 4, floors: [4, 9], seedOffset: 400, zJitter: 2 },
      { count: bCount, xMin: 22, xRange: 6, wMin: 4, wRange: 5, dMin: 4, dRange: 4, floors: [4, 11], seedOffset: 500, zJitter: 2.5 },
      { count: Math.floor(bCount * 0.7), xMin: 32, xRange: 8, wMin: 5, wRange: 5, dMin: 5, dRange: 4, floors: [5, 14], seedOffset: 10000, zJitter: 3 },
      { count: Math.floor(bCount * 0.5), xMin: 45, xRange: 12, wMin: 5, wRange: 6, dMin: 5, dRange: 5, floors: [6, 17], seedOffset: 20000, zJitter: 3 },
    ]
    for (const row of rows) {
      for (let i = 0; i < row.count * 2; i++) {
        const side = i < row.count ? -1 : 1
        const idx = i < row.count ? i : i - row.count
        const ri = i + row.seedOffset
        const w = row.wMin + rand(ri + 3) * row.wRange
        const wanted = row.floors[0] + Math.floor(rand(ri + 4) * (row.floors[1] - row.floors[0]))
        const d = row.dMin + rand(ri + 5) * row.dRange
        for (let attempt = 0; attempt < 20; attempt++) {
          const rSeed = attempt * 200
          const x = side * (row.xMin + rand(ri + 1 + rSeed) * row.xRange)
          const z = 2 + idx * (roadLength / row.count) + rand(ri + 2 + rSeed) * row.zJitter
          const floors = Math.min(wanted, maxFloors(x, z, false))
          if (floors < 1) break
          const h = floors * CITY_FLOOR_HEIGHT + PARAPET_HEIGHT
          if (!overlaps(x, z, w / 2, d / 2)) {
            add(x, z, w, h, d, pickStyle(rand(ri + 6), floors >= 9), rand(ri + 7))
            break
          }
        }
      }
    }

    // Setbacks: some towers continue in a narrower tier on top of their base.
    const baseCount = positions.length
    for (let i = 0; i < baseCount; i++) {
      const [cx, , cz] = positions[i]
      const [w, h, d] = scales[i]
      if (h < 20 || rand(i * 5 + 77) < 0.45 || maxFloors(cx, cz, false) !== Infinity) continue
      const tierFloors = 2 + Math.floor(rand(i * 5 + 78) * 6)
      const th = tierFloors * CITY_FLOOR_HEIGHT + PARAPET_HEIGHT - 0.01
      // The tier's storeys continue the base's: its height above the ground lines up.
      positions.push([cx, h - PARAPET_HEIGHT + th / 2, cz])
      scales.push([w * 0.66, th, d * 0.66])
      params.push(params[i])
      tones.push(tones[i])
    }

    // Cornices along the top of each wall, balconies with railings, storefront awnings.
    const cornices: Box[] = []
    const balconies: Box[] = []
    const railings: Box[] = []
    const awnings: Box[] = []

    for (let i = 0; i < positions.length; i++) {
      const [cx, cy, cz] = positions[i]
      const [w, h, d] = scales[i]
      const [floorH, bay, style] = params[i]
      const top = cy + h / 2
      if (style === FACADE_STYLE.curtain) {
        cornices.push({ pos: [cx, top - 0.06, cz], scale: [w + 0.06, 0.12, d + 0.06] })
      } else {
        cornices.push({ pos: [cx, top - 0.16, cz], scale: [w + 0.36, 0.32, d + 0.36] })
        cornices.push({ pos: [cx, top - 0.42, cz], scale: [w + 0.16, 0.12, d + 0.16] })
      }

      // Street-facing details only where people see them: the street wall.
      const facesRoad = Math.abs(Math.abs(cx) - w / 2 - frontX) < 0.05 && cy - h / 2 < 0.01
      if (!facesRoad) continue
      const inward = cx > 0 ? -1 : 1
      const faceX = cx + inward * (w / 2)
      const { centers, width } = facadeBays(d, bay)
      const floors = Math.floor((h - PARAPET_HEIGHT) / floorH)

      centers.forEach((c, k) => {
        if (rand(i * 31 + k * 7 + 1) < 0.3) {
          awnings.push({
            pos: [faceX + inward * 0.34, floorH * 0.8 + 0.1, cz + c],
            scale: [0.7, 0.03, width * 0.8],
            rotZ: inward * -0.26,
          })
        }
      })
      if (style === FACADE_STYLE.punched || style === FACADE_STYLE.brick) {
        for (let f = 1; f < floors; f++) {
          centers.forEach((c, k) => {
            if (rand(i * 97 + f * 11 + k * 3) < 0.55) return
            const y = f * floorH + floorH * 0.3
            balconies.push({ pos: [faceX + inward * 0.3, y, cz + c], scale: [0.6, 0.08, width * 0.78] })
            railings.push({ pos: [faceX + inward * 0.58, y + 0.3, cz + c], scale: [0.03, 0.52, width * 0.78] })
          })
        }
      }
    }

    return { positions, scales, params, tones, cornices, balconies, railings, awnings }
  }, [roadLength, experiences, perf.buildingCount])
  const { positions, scales, params, tones } = city

  const envMap = useCityEnvironment()
  const facade = useMemo(() => createFacadeUniforms(), [])
  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      envMap,
      roughness: 0.9,
      metalness: 0.05,
    })
    applyFacade(m, facade)
    return m
  }, [envMap, facade])

  const ledgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.85 }), [])
  const railingMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.7 }), [])
  const awningMaterial = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.95, side: THREE.DoubleSide }), [])

  // Theme colours are plain uniforms: set them without flagging the materials for a rebuild.
  // Layout effect so they are in place before the first frame.
  useLayoutEffect(() => {
    material.color.set(isLight ? '#c8c8c8' : '#383838')
    ledgeMaterial.color.set(isLight ? '#dcdcdc' : '#333333')
    railingMaterial.color.set(isLight ? '#3a3a3a' : '#151515')
    awningMaterial.color.set(isLight ? '#a4a4a4' : '#1e1e1e')
    material.envMapIntensity = isLight ? 0.8 : 0.35
    setFacadeTheme(facade, isLight)
  }, [isLight, material, ledgeMaterial, railingMaterial, awningMaterial, facade])

  useEffect(
    () => () => {
      railingMaterial.dispose()
      awningMaterial.dispose()
    },
    [railingMaterial, awningMaterial]
  )

  const dummy = useMemo(() => new THREE.Object3D(), [])

  // Own geometry for the city: it carries one facade description per instance.
  const cityGeometry = useMemo(() => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    g.setAttribute('aFacade', new THREE.InstancedBufferAttribute(new Float32Array(params.flat()), 3))
    return g
  }, [params])
  useEffect(() => () => cityGeometry.dispose(), [cityGeometry])

  useLayoutEffect(() => {
    const mesh = instancedRef.current
    if (!mesh) return
    const color = new THREE.Color()
    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i]
      const [sx, sy, sz] = scales[i]
      dummy.position.set(x, y, z)
      dummy.scale.set(sx, sy, sz).multiplyScalar(1 - 2 * PLASTER_INSET)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.setColorAt(i, color.setScalar(tones[i]))
    }
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [positions, scales, tones, dummy])

  const expRenderData = useMemo(
    () =>
      experiences.map((exp, index) => {
        const side = index % 2 === 0 ? 1 : -1
        const x = side * (ROAD_WIDTH / 2 + SIDE_OFFSET)
        const months = parsePeriodMonths(exp.period)
        const buildingHeight = monthsToHeight(months)
        const numFloors = Math.max(Math.ceil(months / 12), 1)
        const startYear = parseInt(exp.period.split('–')[0].trim().split(' ')[1])
        const z = exp.position * roadLength
        return { exp, index, side, x, buildingHeight, numFloors, startYear, z }
      }),
    [experiences, roadLength]
  )

  const tickSpacing = 1.5
  const tickWidth = 1.2
  const tickX = ROAD_WIDTH * 0.25
  const timelineTicks = useMemo(() => {
    const count = Math.floor(roadLength / tickSpacing)
    const expZones = experiences.map((exp) => exp.position * roadLength)
    const ticks: number[] = []
    for (let i = 0; i < count; i++) {
      const z = i * tickSpacing
      const nearDate = expZones.some((ez) => Math.abs(z - ez) < 1)
      if (!nearDate) {
        ticks.push(z)
      }
    }
    return ticks
  }, [roadLength, experiences])

  const tickGeometry = useMemo(() => new THREE.PlaneGeometry(tickWidth, 0.06), [])
  const tickMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3, depthTest: false }),
    []
  )
  const tickRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    tickMaterial.color.set(isLight ? '#161616' : '#444444')
  }, [isLight, tickMaterial])

  useEffect(
    () => () => {
      material.dispose()
      ledgeMaterial.dispose()
      tickMaterial.dispose()
      tickGeometry.dispose()
    },
    [material, ledgeMaterial, tickMaterial, tickGeometry]
  )

  // The pyramids and the light on them never move: bake its six shadow passes once.
  const pyramidLightRef = useStaticShadow<THREE.PointLight>()

  useEffect(() => {
    const mesh = tickRef.current
    if (!mesh || timelineTicks.length === 0) return
    for (let i = 0; i < timelineTicks.length; i++) {
      dummy.position.set(tickX, 0.04, timelineTicks[i])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = timelineTicks.length
    mesh.instanceMatrix.needsUpdate = true
  }, [timelineTicks, dummy, tickX])

  return (
    <group>
      {timelineTicks.length > 0 && (
        <instancedMesh ref={tickRef} args={[tickGeometry, tickMaterial, timelineTicks.length]} />
      )}

      {/* Sized by the number of buildings actually placed. The former fixed capacity of
          buildingCount * 12 was below the 12.4 * buildingCount the layout can produce. */}
      <instancedMesh
        key={positions.length}
        ref={instancedRef}
        args={[cityGeometry, material, positions.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      <BoxInstances boxes={city.cornices} material={ledgeMaterial} castShadow />
      <BoxInstances boxes={city.balconies} material={ledgeMaterial} castShadow />
      <BoxInstances boxes={city.railings} material={railingMaterial} />
      <BoxInstances boxes={city.awnings} material={awningMaterial} castShadow />

      <group position={[0, 0, experiences[0] ? experiences[0].position * roadLength : 0]}>
        <GizaPyramids theme={theme} />
        <pointLight
          ref={pyramidLightRef}
          position={[60, 25, 18]}
          color={isLight ? '#e0e0e0' : '#dddddd'}
          intensity={isLight ? 5 : 20}
          distance={60}
          castShadow
        />
      </group>

      <group position={[0, 0, experiences[4] ? experiences[4].position * roadLength : 0]}>
        <BerlinTVTower theme={theme} />
        <pointLight position={[48, 45, 2]} color={isLight ? '#d0d0d0' : '#dddddd'} intensity={isLight ? 5 : 22} distance={55} decay={1.2} />
      </group>

      {expRenderData.map(({ exp, index, x, buildingHeight, numFloors, startYear, z }) => {
        const isActive = exp.id === activeExperienceId

        return (
          <group key={exp.id} position={[0, 0, z]}>
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
                <Logo3D logoUrl={exp.logo} isActive={isActive} theme={theme} />
              </group>
            )}
            <RoadDateMarking period={exp.period} isActive={isActive} theme={theme} />
          </group>
        )
      })}

      <ActiveLights
        active={expRenderData.find((d) => d.exp.id === activeExperienceId)}
        isLight={isLight}
        enableShadows={perf.buildingShadows}
      />
    </group>
  )
}
