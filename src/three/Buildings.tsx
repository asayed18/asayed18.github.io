import { useMemo, useRef, useEffect, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text } from '@react-three/drei'
import { CanvasText } from './CanvasText'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../App'
import type { PerfPreset } from '../utils/devicePerf'
import { ROAD_WIDTH, BACKGROUND_SIDE_OFFSET } from './config'

const SIDE_OFFSET = BACKGROUND_SIDE_OFFSET
const BUILDING_WIDTH = 5

const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

function parsePeriodMonths(period: string): number {
  const parts = period.split('–').map((s) => s.trim())
  const parseDate = (s: string): Date => {
    if (s === 'Present') return new Date()
    const [mon, year] = s.split(' ')
    return new Date(parseInt(year), MONTH_MAP[mon] ?? 0)
  }
  const start = parseDate(parts[0])
  const end = parseDate(parts[1] ?? 'Present')
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  return Math.max(months, 1)
}

// Scale months to building height: min 4, max 16
const MIN_HEIGHT = 4
const MAX_HEIGHT = 16

function monthsToHeight(months: number): number {
  // Clamp between 6 months and 48 months for scaling
  const t = Math.min(Math.max(months, 6), 48)
  return MIN_HEIGHT + ((t - 6) / (48 - 6)) * (MAX_HEIGHT - MIN_HEIGHT)
}

interface BuildingsProps {
  roadLength: number
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
  onReady?: () => void
}

/* Giza Pyramids landmark (far behind the first experience building) */
const GizaPyramids = memo(function GizaPyramids({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  const stoneColor = isLight ? '#101010' : '#3a3a3a'
  const stoneEmissive = isLight ? '#101010' : '#2e2e2e'

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
  const towerColor = isLight ? '#555555' : '#404040'
  const towerEmissive = isLight ? '#303030' : '#252525'

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

        {isActive && (
          <pointLight
            color={isLight ? '#cccccc' : '#aaaaaa'}
            intensity={isLight ? 2 : 4}
            distance={12}
            castShadow
          />
        )}
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

      <Text
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI]}
        fontSize={0.55}
        color={isActive ? (isLight ? '#343434' : '#5a5a5a') : (isLight ? '#888888' : '#666666')}
        anchorX="center"
        anchorY="middle"
      >
        {joinDate}
      </Text>
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
  enableShadows = true,
}: {
  x: number
  width: number
  height: number
  depth: number
  numFloors: number
  startYear: number
  isActive: boolean
  isLight: boolean
  enableShadows?: boolean
}) {
  const sharedWindowGeo = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const sharedLedgeGeo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])

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

  const texture = useTexture([
    '/textures/painted_plaster_wall_diff_1k.jpg',
    '/textures/painted_plaster_wall_nor_gl_1k.jpg',
    '/textures/painted_plaster_wall_rough_1k.jpg',
    '/textures/painted_plaster_wall_disp_1k.png',
  ])
  texture.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(20, 20)
  })

  const bodyColor = isActive ? (isLight ? '#eeeeee' : '#707070') : (isLight ? '#d8d8d8' : '#333333')
  const bodyEmissive = isActive ? (isLight ? '#cccccc' : '#555555') : (isLight ? '#000000' : '#080808')
  const windowColor = isActive ? (isLight ? '#aaaaaa' : '#595959') : (isLight ? '#909090' : '#000')
  const windowEmissive = isActive ? (isLight ? '#999999' : '#888888') : (isLight ? '#666666' : '#0e0e0e')
  const ledgeColor = isActive ? (isLight ? '#dddddd' : '#666666') : (isLight ? '#cccccc' : '#2a2a2a')

  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={bodyEmissive}
          emissiveIntensity={isActive ? 0.1 : 0}
          map={texture[0]}
          normalMap={texture[1]}
          roughnessMap={texture[2]}
          displacementMap={texture[3]}
          displacementScale={-0.01}
          roughness={0.9}
          metalness={0.03}
        />
      </mesh>

      {isActive && (
        <pointLight
          position={[0, height + 3, 0]}
          color={isLight ? '#e0e0e0' : '#9b9b9b'}
          intensity={isLight ? 3 : 0.9}
          castShadow={enableShadows}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.0005}
          shadow-camera-near={0.5}
          shadow-camera-far={height * 2.5}
        />
      )}

      {windows.map((win, i) => (
        <mesh
          key={`w-${i}`}
          position={win.pos}
          rotation={win.rot}
          geometry={sharedWindowGeo}
          scale={[windowWidth, windowHeight, 1]}
          receiveShadow
        >
          {isActive ? (
            <meshStandardMaterial
              color={isLight ? '#f2f2f2' : '#e0e0e0'}
              metalness={0.35}
              roughness={0.1}
              transparent
              opacity={0.9}
              emissive={isLight ? '#e0e0e0' : '#c0c0c0'}
              emissiveIntensity={0.2}
            />
          ) : (
            <meshStandardMaterial
              color={windowColor}
              emissive={windowEmissive}
              emissiveIntensity={0.15}
              metalness={0.15}
              roughness={0.25}
              transparent
              opacity={0.7}
            />
          )}
        </mesh>
      ))}

      {isActive && (
        <pointLight
          position={[(x > 0 ? -1 : 1) * (width / 2 + 3), height * 0.5, 0]}
          color={isLight ? '#cccccc' : '#aaaaaa'}
          intensity={isLight ? 20.5 : 100}
          castShadow={enableShadows}
          shadow-mapSize-width={512}
          shadow-mapSize-height={512}
          shadow-bias={-0.05}
          shadow-camera-near={0.9}
          shadow-camera-far={12}
        />
      )}

      {ledgeYs.map((y, i) => (
        <mesh
          key={`l-${i}`}
          position={[0, y, 0]}
          geometry={sharedLedgeGeo}
          scale={[width + 0.08, 0.06, depth + 0.08]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={ledgeColor} />
        </mesh>
      ))}

      {Array.from({ length: numFloors }, (_, floor) => {
        const facingRoad = x > 0 ? -1 : 1
        const labelX = facingRoad * (width / 2 + 0.02)
        const labelZ = depth / 2 - 1.5
        const rotY = facingRoad > 0 ? Math.PI / 2 : -Math.PI / 2

        return (
          <group key={`yr-${floor}`} position={[labelX, floor * floorHeight + floorHeight * 0.15, labelZ]}>
            <CanvasText
              position={[0, 0, 0]}
              rotation={[0, rotY, 0]}
              scale={[1, 1, 1]}
              fontSize={floorHeight * 0.12}
              color={isActive ? (isLight ? '#e8e8e8' : '#c0c0c0') : windowColor}
              opacity={isActive ? 1 : 0.8}
              anchorX={facingRoad > 0 ? 'right' : 'left'}
              anchorY="bottom"
              fontWeight="bold"
            >
              {String(startYear + floor)}
            </CanvasText>
          </group>
        )
      })}
    </group>
  )
})

export function Buildings({ roadLength, experiences, activeExperienceId, theme, perf, onReady }: BuildingsProps) {
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
        let h = row.hMin + rand(ri + 4) * row.hRange
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

  const texture = useTexture([
    '/textures/painted_plaster_wall_diff_1k.jpg',
    '/textures/painted_plaster_wall_nor_gl_1k.jpg',
    '/textures/painted_plaster_wall_rough_1k.jpg',
    '/textures/painted_plaster_wall_disp_1k.png',
  ])
  texture.forEach((tex) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(20, 20)
  })
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#e0e0e0',
        map: texture[0],
        normalMap: texture[1],
        roughnessMap: texture[2],
        displacementMap: texture[3],
        displacementScale: -0.01,
        roughness: 0.9,
        metalness: 0.05,
      }),
    []
  )

  const ledgeGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const ledgeMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222222' }), [])

  const windowGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const windowMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: isLight ? '#a0a0a0' : '#3a3a3a',
        emissive: isLight ? '#0f0f0f' : '#0a0a0a',
        emissiveIntensity: 0.15,
        metalness: 0.25,
        roughness: 0.18,
        transparent: true,
        opacity: 0.78,
      }),
    []
  )

  useEffect(() => {
    material.color.set(isLight ? '#c8c8c8' : '#383838')
    material.needsUpdate = true
    ledgeMaterial.color.set(isLight ? '#d8d8d8' : '#303030')
    ledgeMaterial.needsUpdate = true
    windowMaterial.needsUpdate = true
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
      dummy.scale.set(sx, sy, sz)
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
    () => new THREE.MeshStandardMaterial({ color: '#444444', transparent: true, opacity: 0.3, depthTest: false }),
    []
  )
  const tickRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    tickMaterial.color.set(isLight ? '#161616' : '#444444')
    tickMaterial.needsUpdate = true
  }, [isLight, tickMaterial])

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

  const readyFired = useRef(false)
  useEffect(() => {
    if (!readyFired.current && positions.length > 0) {
      readyFired.current = true
      onReady?.()
    }
  }, [positions, onReady])

  return (
    <group>
      {timelineTicks.length > 0 && (
        <instancedMesh ref={tickRef} args={[tickGeometry, tickMaterial, timelineTicks.length]} />
      )}

      <instancedMesh
        ref={instancedRef}
        args={[geometry, material, perf.buildingCount * 12]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {ledgeInstances.length > 0 && (
        <instancedMesh
          ref={ledgeRef}
          args={[ledgeGeometry, ledgeMaterial, ledgeInstances.length]}
          frustumCulled={false}
        />
      )}

      {windowInstances.length > 0 && (
        <instancedMesh
          ref={windowRef}
          args={[windowGeometry, windowMaterial, windowInstances.length]}
          frustumCulled={false}
        />
      )}

      <group position={[0, 0, experiences[0] ? experiences[0].position * roadLength : 0]}>
        <GizaPyramids theme={theme} />
        <pointLight position={[60, 25, 18]} color={isLight ? '#e0e0e0' : '#dddddd'} intensity={isLight ? 5 : 20} distance={60} castShadow />
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
              enableShadows={perf.buildingShadows}
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
    </group>
  )
}
