import { useMemo, useRef, useEffect, useLayoutEffect, memo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import { CanvasText, GroundText } from './CanvasText'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../theme'
import type { PerfPreset } from '../utils/devicePerf'
import { ROAD_WIDTH, BACKGROUND_SIDE_OFFSET } from './config'
import { parsePeriodMonths, monthsToHeight } from './period'
import { useStaticShadow } from './shadows'
import { keepRendering, MAX_EASING_STEP } from './pacing'

const SIDE_OFFSET = BACKGROUND_SIDE_OFFSET
const BUILDING_WIDTH = 5

/**
 * Wall textures. Every wall repeats them 20 times, so one tile never covers more than about
 * 64 screen pixels: 256px sources are sampled exactly like the former 1K ones (the GPU only ever
 * reached their small mip levels) at a sixteenth of the download and GPU memory.
 */
const PLASTER_TEXTURES = [
  '/textures/painted_plaster_wall_diff_256.webp',
  '/textures/painted_plaster_wall_nor_gl_256.webp',
  '/textures/painted_plaster_wall_rough_256.webp',
]

function usePlasterTextures() {
  const textures = useTexture(PLASTER_TEXTURES)
  textures.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(20, 20)
  })
  return textures
}

/**
 * The walls used to carry a displacement map. A box has no vertices inside its faces, so the map
 * could not add relief: it only pulled every face inwards by this constant amount (in units of
 * the box geometry) and cost a vertex-shader texture lookup plus extra shadow shader variants.
 * The inset is applied to the geometry instead, so nothing moves.
 */
const PLASTER_INSET = 0.0077

const WINDOW_GEOMETRY = new THREE.PlaneGeometry(1, 1)
const UNIT_BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1)

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
  const stoneColor = isLight ? '#222222' : '#0a0a0a'
  const stoneEmissive = isLight ? '#111111' : '#050505'

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
  const towerColor = isLight ? '#333333' : '#080808'
  const towerEmissive = isLight ? '#222222' : '#050505'

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
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      data[i] = gray
      data[i + 1] = gray
      data[i + 2] = gray
    }
    ctx.putImageData(imageData, 0, 0)
    texture.image = canvas
    texture.minFilter = THREE.LinearFilter
    texture.magFilter = THREE.LinearFilter
    texture.generateMipmaps = false
    texture.needsUpdate = true
  }, [texture])

  const aspect = texture.image ? texture.image.width / texture.image.height : 2

  const signWidth = BUILDING_WIDTH * 0.55
  const signHeight = signWidth / Math.min(aspect, 3)
  const depth = 0.25
  const poleHeight = 1.5
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

  return (
    <group>
      <mesh position={[0, poleHeight / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.12, poleHeight, 6]} />
        <meshStandardMaterial
          color={isLight ? '#999999' : '#666666'}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      <group ref={groupRef} renderOrder={10}>
        <mesh castShadow renderOrder={10}>
          <boxGeometry args={[signWidth + 0.15, signHeight + 0.15, depth]} />
          <meshStandardMaterial
            color={isActive ? (isLight ? '#d0d0d0' : '#888888') : (isLight ? '#aaaaaa' : '#444444')}
            metalness={0.85}
            roughness={0.15}
            emissive={isActive ? (isLight ? '#aaaaaa' : '#666666') : (isLight ? '#777777' : '#111111')}
            emissiveIntensity={isActive ? 0.5 : 0.05}
          />
        </mesh>

        <mesh position={[0, 0, depth / 2 + 0.005]} renderOrder={11}>
          <planeGeometry args={[signWidth, signHeight]} />
          <meshStandardMaterial
            map={texture}
            transparent
            color={isActive ? '#ffffff' : (isLight ? '#cccccc' : '#999999')}
            emissive={isActive ? '#dddddd' : (isLight ? '#666666' : '#222222')}
            emissiveIntensity={isActive ? 0.7 : 0.05}
            metalness={0.1}
            roughness={0.5}
            depthTest={false}
          />
        </mesh>

        <mesh
          position={[0, 0, -(depth / 2 + 0.005)]}
          rotation={[0, Math.PI, 0]}
          renderOrder={11}
        >
          <planeGeometry args={[signWidth, signHeight]} />
          <meshStandardMaterial
            map={texture}
            transparent
            color={isActive ? '#ffffff' : (isLight ? '#cccccc' : '#999999')}
            emissive={isActive ? '#dddddd' : (isLight ? '#666666' : '#222222')}
            emissiveIntensity={isActive ? 0.7 : 0.05}
            metalness={0.1}
            roughness={0.5}
            depthTest={false}
          />
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
}: {
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
  const windowWidth = 0.55
  const windowHeight = floorHeight * 0.45
  const windowsPerFace = 3

  const windows = useMemo(() => {
    const result: { pos: [number, number, number]; rot: [number, number, number] }[] = []

    for (let floor = 0; floor < numFloors; floor++) {
      const floorY = floor * floorHeight + floorHeight * 0.55
      const wSpacing = width / (windowsPerFace + 1)

      for (let w = 0; w < windowsPerFace; w++) {
        const wx = -width / 2 + wSpacing * (w + 1)
        result.push({ pos: [wx, floorY, depth / 2 + 0.01], rot: [0, 0, 0] })
        result.push({ pos: [wx, floorY, -depth / 2 - 0.01], rot: [0, Math.PI, 0] })
      }

      const sSpacing = depth / (windowsPerFace + 1)
      for (let w = 0; w < windowsPerFace; w++) {
        const wz = -depth / 2 + sSpacing * (w + 1)
        result.push({ pos: [width / 2 + 0.01, floorY, wz], rot: [0, Math.PI / 2, 0] })
        result.push({ pos: [-width / 2 - 0.01, floorY, wz], rot: [0, -Math.PI / 2, 0] })
      }
    }
    return result
  }, [numFloors, floorHeight, width, depth])

  const ledgeYs = useMemo(() => {
    const result: number[] = []
    for (let floor = 1; floor < numFloors; floor++) {
      result.push(floor * floorHeight)
    }
    return result
  }, [numFloors, floorHeight])

  const texture = usePlasterTextures()

  // One instanced mesh for all windows of the building instead of one mesh and one material per
  // window (the Babbel tower alone has 60).
  const windowsRef = useRef<THREE.InstancedMesh>(null)
  useLayoutEffect(() => {
    const mesh = windowsRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    windows.forEach((win, i) => {
      dummy.position.set(win.pos[0], win.pos[1], win.pos[2])
      dummy.rotation.set(win.rot[0], win.rot[1], win.rot[2])
      dummy.scale.set(windowWidth, windowHeight, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [windows, windowWidth, windowHeight])

  const bodyColor = isActive ? (isLight ? '#ffffff' : '#666666') : (isLight ? '#e0e0e0' : '#111111')
  const bodyEmissive = isActive ? (isLight ? '#dddddd' : '#222222') : (isLight ? '#000000' : '#000000')
  const windowColor = isActive ? (isLight ? '#888888' : '#ffffff') : (isLight ? '#cccccc' : '#000000')
  const windowEmissive = isActive ? (isLight ? '#666666' : '#ffffff') : (isLight ? '#999999' : '#000000')
  const ledgeColor = isActive ? (isLight ? '#eeeeee' : '#050505') : (isLight ? '#cdcdcd' : '#1a1a1a')

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry
          args={[width - 2 * PLASTER_INSET, height - 2 * PLASTER_INSET, depth - 2 * PLASTER_INSET]}
        />
        <meshStandardMaterial
          color={bodyColor}
          emissive={bodyEmissive}
          emissiveIntensity={isActive ? 0.1 : 0}
          map={texture[0]}
          normalMap={texture[1]}
          roughnessMap={texture[2]}
          roughness={0.9}
          metalness={0.03}
        />
      </mesh>

      <instancedMesh
        key={windows.length}
        ref={windowsRef}
        args={[WINDOW_GEOMETRY, undefined, windows.length]}
        receiveShadow
      >
        <meshStandardMaterial
          color={isActive ? (isLight ? '#f2f2f2' : '#e0e0e0') : windowColor}
          emissive={isActive ? (isLight ? '#e0e0e0' : '#c0c0c0') : windowEmissive}
          emissiveIntensity={isActive ? 0.2 : 0.15}
          metalness={isActive ? 0.35 : 0.15}
          roughness={isActive ? 0.1 : 0.25}
          transparent
          opacity={isActive ? 0.9 : 0.7}
        />
      </instancedMesh>

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
              color={isActive ? (isLight ? '#e8e8e8' : '#c0c0c0') : windowColor}
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
  const { positions, scales, ledgeInstances, windowInstances } = useMemo(() => {
    const positions: [number, number, number][] = []
    const scales: [number, number, number][] = []
    const seed = 12345
    const rand = (i: number) => {
      const x = Math.sin(seed + i * 0.1) * 10000
      return x - Math.floor(x)
    }

    const EXP_W = 0
    const EXP_D = 0
    const MARGIN = 0.01
    const expZones = experiences.map((exp, index) => {
      const side = index % 2 === 0 ? 1 : -1
      return {
        x: side * (ROAD_WIDTH / 2 + SIDE_OFFSET),
        z: exp.position * roadLength,
        hw: EXP_W / 2,
        hd: EXP_D / 2,
      }
    })

    const pyramidZ = experiences[0] ? experiences[0].position * roadLength : 0
    expZones.push({ x: 50, z: pyramidZ, hw: 18, hd: 25 })

    const overlaps = (cx: number, cz: number, hw: number, hd: number) => {
      for (const zone of expZones) {
        if (
          Math.abs(cx - zone.x) < hw + zone.hw + MARGIN &&
          Math.abs(cz - zone.z) < hd + zone.hd + MARGIN
        ) {
          return true
        }
      }
      for (let j = 0; j < positions.length; j++) {
        const [px, , pz] = positions[j]
        const [sw, , sd] = scales[j]
        if (
          Math.abs(cx - px) < hw + sw / 2 + MARGIN &&
          Math.abs(cz - pz) < hd + sd / 2 + MARGIN
        ) {
          return true
        }
      }
      return false
    }

    const bCount = perf.buildingCount
    const baseX = ROAD_WIDTH / 2 + SIDE_OFFSET
    const rows = [
      // Near-road fillers to close the gap to the experience buildings
      { count: bCount, xMin: baseX - 1, xRange: 3, wMin: 2, wRange: 2, dMin: 1.8, dRange: 2, hMin: 2, hRange: 5, seedOffset: 250, zJitter: 1.2 },
      { count: bCount, xMin: baseX + 1, xRange: 4, wMin: 4, wRange: 4, dMin: 2.5, dRange: 3, hMin: 3, hRange: 10, seedOffset: 400, zJitter: 1.5 },
      // Original rows, slightly pulled in by reduced SIDE_OFFSET
      { count: bCount, xMin: baseX + 5, xRange: 5, wMin: 4, wRange: 5, dMin: 2, dRange: 4, hMin: 3, hRange: 8, seedOffset: 500, zJitter: 2 },
      { count: bCount, xMin: baseX + 11, xRange: 5, wMin: 3, wRange: 5, dMin: 2, dRange: 3, hMin: 2, hRange: 6, seedOffset: 10000, zJitter: 2.5 },
      { count: bCount, xMin: baseX + 17, xRange: 5, wMin: 3, wRange: 4, dMin: 2, dRange: 3, hMin: 2, hRange: 5, seedOffset: 15000, zJitter: 2.5 },
      { count: Math.floor(bCount * 0.6), xMin: baseX + 24, xRange: 8, wMin: 3, wRange: 5, dMin: 3, dRange: 5, hMin: 6, hRange: 9, seedOffset: 20000, zJitter: 3 },
      { count: Math.floor(bCount * 0.6), xMin: baseX + 38, xRange: 8, wMin: 3, wRange: 5, dMin: 3, dRange: 5, hMin: 6, hRange: 9, seedOffset: 25000, zJitter: 3 },
    ]

    for (const row of rows) {
      for (let i = 0; i < row.count * 2; i++) {
        const side = i < row.count ? -1 : 1
        const idx = i < row.count ? i : i - row.count
        const ri = i + row.seedOffset
        const w = row.wMin + rand(ri + 3) * row.wRange
        const h = row.hMin + rand(ri + 4) * row.hRange
        const d = row.dMin + rand(ri + 5) * row.dRange

        let placed = false
        for (let attempt = 0; attempt < 20 && !placed; attempt++) {
          const rSeed = attempt * 200
          const x = side * (row.xMin + rand(ri + 1 + rSeed) * row.xRange)
          const z = 2 + idx * (roadLength / row.count) + rand(ri + 2 + rSeed) * row.zJitter

          if (!overlaps(x, z, w / 2, d / 2)) {
            positions.push([x, h / 2, z])
            scales.push([w, h, d])
            placed = true
          }
        }
      }
    }

    const BG_FLOOR_H = 3.5
    const BG_WIN_PER_FACE = 2
    const BG_WIN_WIDTH = 0.5

    const ledgeInstances: { pos: [number, number, number]; scale: [number, number, number] }[] = []
    const windowInstances: {
      pos: [number, number, number]
      rot: [number, number, number]
      scale: [number, number, number]
    }[] = []

    for (let i = 0; i < positions.length; i++) {
      const [cx, , cz] = positions[i]
      const [w, h, d] = scales[i]
      const numFloors = Math.max(Math.floor(h / BG_FLOOR_H), 1)
      const floorH = h / numFloors
      const winH = floorH * 0.4

      for (let f = 1; f < numFloors; f++) {
        ledgeInstances.push({
          pos: [cx, f * floorH, cz],
          scale: [w + 0.08, 0.06, d + 0.08],
        })
      }

      for (let f = 0; f < numFloors; f++) {
        const floorY = f * floorH + floorH * 0.55
        const sSpacing = d / (BG_WIN_PER_FACE + 1)
        const innerSide = cx > 0 ? -1 : 1
        for (let wn = 0; wn < BG_WIN_PER_FACE; wn++) {
          const wz = -d / 2 + sSpacing * (wn + 1)
          windowInstances.push({
            pos: [cx + innerSide * (w / 2 + 0.01), floorY, cz + wz],
            rot: [0, innerSide > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
            scale: [BG_WIN_WIDTH, winH, 1],
          })
        }
      }
    }

    return { positions, scales, ledgeInstances, windowInstances }
  }, [roadLength, experiences, perf.buildingCount])

  const texture = usePlasterTextures()
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: texture[0],
        normalMap: texture[1],
        roughnessMap: texture[2],
        roughness: 0.9,
        metalness: 0.05,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texture[0], texture[1], texture[2]]
  )

  const ledgeMaterial = useMemo(() => new THREE.MeshStandardMaterial(), [])

  const windowMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        emissiveIntensity: 0.15,
        metalness: 0.25,
        roughness: 0.18,
        transparent: true,
        opacity: 0.78,
      }),
    []
  )

  // Theme colours are plain uniforms: set them without flagging the materials for a rebuild.
  // Layout effect so they are in place before the first frame.
  useLayoutEffect(() => {
    material.color.set(isLight ? '#c8c8c8' : '#383838')
    ledgeMaterial.color.set(isLight ? '#d8d8d8' : '#303030')
    windowMaterial.color.set(isLight ? '#a0a0a0' : '#3a3a3a')
    windowMaterial.emissive.set(isLight ? '#0f0f0f' : '#0a0a0a')
  }, [isLight, material, ledgeMaterial, windowMaterial])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  const ledgeRef = useRef<THREE.InstancedMesh>(null)
  const windowRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mesh = instancedRef.current
    if (!mesh) return
    for (let i = 0; i < positions.length; i++) {
      const [x, y, z] = positions[i]
      const [sx, sy, sz] = scales[i]
      dummy.position.set(x, y, z)
      dummy.scale.set(sx, sy, sz).multiplyScalar(1 - 2 * PLASTER_INSET)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = positions.length
    mesh.instanceMatrix.needsUpdate = true
  }, [positions, scales, dummy])

  useEffect(() => {
    const mesh = ledgeRef.current
    if (!mesh || ledgeInstances.length === 0) return
    for (let i = 0; i < ledgeInstances.length; i++) {
      const { pos, scale } = ledgeInstances[i]
      dummy.position.set(pos[0], pos[1], pos[2])
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(scale[0], scale[1], scale[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = ledgeInstances.length
    mesh.instanceMatrix.needsUpdate = true
  }, [ledgeInstances, dummy])

  useEffect(() => {
    const mesh = windowRef.current
    if (!mesh || windowInstances.length === 0) return
    for (let i = 0; i < windowInstances.length; i++) {
      const { pos, rot, scale } = windowInstances[i]
      dummy.position.set(pos[0], pos[1], pos[2])
      dummy.rotation.set(rot[0], rot[1], rot[2])
      dummy.scale.set(scale[0], scale[1], scale[2])
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = windowInstances.length
    mesh.instanceMatrix.needsUpdate = true
  }, [windowInstances, dummy])

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
      windowMaterial.dispose()
      tickMaterial.dispose()
      tickGeometry.dispose()
    },
    [material, ledgeMaterial, windowMaterial, tickMaterial, tickGeometry]
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
        args={[UNIT_BOX_GEOMETRY, material, positions.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {ledgeInstances.length > 0 && (
        <instancedMesh
          ref={ledgeRef}
          args={[UNIT_BOX_GEOMETRY, ledgeMaterial, ledgeInstances.length]}
          frustumCulled={false}
        />
      )}

      {windowInstances.length > 0 && (
        <instancedMesh
          ref={windowRef}
          args={[WINDOW_GEOMETRY, windowMaterial, windowInstances.length]}
          frustumCulled={false}
        />
      )}

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

      {expRenderData.map(({ exp, x, buildingHeight, numFloors, startYear, z }) => {
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
