import { useMemo, useRef, useEffect, memo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { Experience } from '../data/experiences'
import type { Theme } from '../App'

const ROAD_WIDTH = 10
const SIDE_OFFSET = 8
const COUNT_PER_SIDE = 100
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
  onReady?: () => void
}

/* ── Giza Pyramids landmark (far behind the first experience building) ── */
const GizaPyramids = memo(function GizaPyramids({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  // Match the background building body color
  const stoneColor = isLight ? '#909090' : '#030303'
  const stoneEmissive = isLight ? '#606060' : '#000000'
  // White limestone capstone for the Great Pyramid
  const capColor = isLight ? '#f0ece4' : '#444038'
  const capEmissive = isLight ? '#d8d0c0' : '#2a2820'

  // Distant silhouettes behind the first experience building — pushed further back, scaled up
  const pyramids: { x: number; z: number; height: number; radius: number; hasCap?: boolean }[] = [
    // Great Pyramid of Khufu
    { x: 80, z: 18, height: 35, radius: 34, hasCap: true },
    // Pyramid of Khafre
    { x: 65, z: -6, height: 31, radius: 30 },
    // Pyramid of Menkaure
    { x: 50, z: -28, height: 18, radius: 18 },
    // Queen's pyramids (small satellites)
    { x: 44, z: -40, height: 7.5, radius: 7.5 },
    { x: 40, z: -34, height: 7, radius: 7 },
    { x: 36, z: -28, height: 6, radius: 6 },
  ]

  // Capstone proportions: top 20% of the pyramid height
  const capRatio = 0.20
  // Ledge band color (slightly darker than cap for depth contrast)
  const ledgeColor = isLight ? '#d0c8b8' : '#333028'

  return (
    <group>
      {pyramids.map((p, i) => {
        const capHeight = p.height * capRatio
        const capRadius = p.radius * capRatio
        const capBaseY = p.height * (1 - capRatio)
        // Ledge sits at the junction between body and capstone
        const ledgeThickness = capHeight * 0.08
        const ledgeRadius = capRadius * 1.25

        return (
          <group key={`pyramid-${i}`}>
            <mesh
              position={[p.x, p.height / 2, p.z]}
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
            {/* White limestone capstone on the Great Pyramid */}
            {p.hasCap && (
              <>
                {/* Capstone cone */}
                <mesh
                  position={[p.x, capBaseY + capHeight / 2, p.z]}
                  rotation={[0, Math.PI / 4, 0]}
                  castShadow
                >
                  <coneGeometry args={[capRadius, capHeight, 4]} />
                  <meshStandardMaterial
                    color={capColor}
                    emissive={capEmissive}
                    emissiveIntensity={0.7}
                    flatShading
                  />
                </mesh>
                {/* Protruding ledge band at capstone base for 3D depth */}
                <mesh
                  position={[p.x, capBaseY + ledgeThickness / 2, p.z]}
                  rotation={[0, Math.PI / 4, 0]}
                >
                  <boxGeometry args={[ledgeRadius * 2, ledgeThickness, ledgeRadius * 2]} />
                  <meshStandardMaterial
                    color={ledgeColor}
                    emissive={capEmissive}
                    emissiveIntensity={0.4}
                    flatShading
                  />
                </mesh>
              </>
            )}
          </group>
        )
      })}
    </group>
  )
})

/* ── Berlin Fernsehturm (TV Tower) landmark behind the fifth experience ── */
const BerlinTVTower = memo(function BerlinTVTower({ theme }: { theme: Theme }) {
  const isLight = theme === 'light'
  const towerColor = isLight ? '#353535' : '#0a0a0a'
  const towerEmissive = isLight ? '#131313' : '#131313'

  const shaftHeight = 40
  const shaftRadiusBottom = 2.2
  const shaftRadiusTop = 1.1
  const sphereRadius = 6
  const sphereY = shaftHeight * 0.72
  const antennaHeight = 16
  const antennaY = sphereY + sphereRadius + antennaHeight / 2

  // Position behind the 5th experience building, further from the road
  const towerX = 65
  const towerZ = 10

  return (
    <group position={[towerX, 0, towerZ]}>
      {/* Main tapered shaft */}
      <mesh position={[0, shaftHeight / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[shaftRadiusTop, shaftRadiusBottom, shaftHeight, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Observation sphere */}
      <mesh position={[0, sphereY, 0]} castShadow receiveShadow>
        <sphereGeometry args={[sphereRadius, 10, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Small collar / ring below the sphere */}
      <mesh position={[0, sphereY - sphereRadius * 0.7, 0]}>
        <cylinderGeometry args={[3.8, 3, 2.2, 8]} />
        <meshStandardMaterial
          color={towerColor}
          emissive={towerEmissive}
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Antenna spire */}
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

  // Convert texture to grayscale for monochromatic look
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
    texture.needsUpdate = true
  }, [texture])

  const aspect = texture.image
    ? texture.image.width / texture.image.height
    : 2

  const signWidth = BUILDING_WIDTH * 0.55
  const signHeight = signWidth / Math.min(aspect, 3)
  const depth = 0.25
  const poleHeight = 1.5
  const signBaseY = poleHeight + signHeight / 2 + 0.1

  const worldPos = useRef(new THREE.Vector3())

  // Face camera + gentle floating animation — only when within render distance
  useFrame((state) => {
    if (!groupRef.current) return

    // Skip expensive updates for distant logos
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
      {/* Pole growing up from building roof (Y=0 = roof level) */}
      <mesh position={[0, poleHeight / 2, 0]}>
        <cylinderGeometry args={[0.08, 0.12, poleHeight, 6]} />
        <meshStandardMaterial
          color={isLight ? '#999999' : '#666666'}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      <group ref={groupRef} renderOrder={10}>
        {/* 3D metallic frame / body */}
        <mesh castShadow renderOrder={10}>
          <boxGeometry args={[signWidth + 0.15, signHeight + 0.15, depth]} />
          <meshStandardMaterial
            color={isActive ? (isLight ? '#d0d0d0' : '#808080') : (isLight ? '#aaaaaa' : '#555555')}
            metalness={0.85}
            roughness={0.15}
            emissive={isActive ? (isLight ? '#999999' : '#555555') : (isLight ? '#888888' : '#222222')}
            emissiveIntensity={isActive ? 0.4 : 0.05}
          />
        </mesh>

        {/* Logo face — front */}
        <mesh position={[0, 0, depth / 2 + 0.005]} renderOrder={11}>
          <planeGeometry args={[signWidth, signHeight]} />
          <meshStandardMaterial
            map={texture}
            transparent
            color={isActive ? '#ffffff' : (isLight ? '#ffffff' : '#dddddd')}
            emissive={isActive ? '#ffffff' : (isLight ? '#888888' : '#555555')}
            emissiveIntensity={isActive ? 0.6 : 0.1}
            metalness={0.1}
            roughness={0.5}
            depthTest={false}
          />
        </mesh>

        {/* Logo face — back */}
        <mesh
          position={[0, 0, -(depth / 2 + 0.005)]}
          rotation={[0, Math.PI, 0]}
          renderOrder={11}
        >
          <planeGeometry args={[signWidth, signHeight]} />
          <meshStandardMaterial
            map={texture}
            transparent
            color={isActive ? '#ffffff' : (isLight ? '#ffffff' : '#dddddd')}
            emissive={isActive ? '#ffffff' : (isLight ? '#888888' : '#555555')}
            emissiveIntensity={isActive ? 0.6 : 0.1}
            metalness={0.1}
            roughness={0.5}
            depthTest={false}
          />
        </mesh>

        {/* Point-light glow when active */}
        {isActive && (
          <pointLight
            color={isLight ? '#cccccc' : '#888888'}
            intensity={3}
            distance={10}
            decay={2}
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
  // Extract joining date (first part before "–")
  const joinDate = period.split('–')[0].trim()

  return (
    <group position={[0, 0.02, 0]}>
      {/* Left segment of date line (gap in center for text) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-3, 0, 0]}>
        <planeGeometry args={[2.5, 0.08]} />
        <meshBasicMaterial
          color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#777777' : '#555555')}
          transparent
          opacity={isActive ? 0.9 : 0.4}
          depthTest={false}
        />
      </mesh>
      {/* Right segment of date line */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3, 0, 0]}>
        <planeGeometry args={[2.5, 0.08]} />
        <meshBasicMaterial
          color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#777777' : '#555555')}
          transparent
          opacity={isActive ? 0.9 : 0.4}
          depthTest={false}
        />
      </mesh>

      {/* Date text painted on road */}
      <Text
        position={[0, 0, 0]}
        rotation={[-Math.PI / 2, 0, Math.PI]}
        scale={[0.8, 5, 1]}
        fontSize={0.8}
        color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#888888' : '#666666')}
        anchorX="center"
        anchorY="middle"
        font={undefined}
        renderOrder={5}
      >
        {joinDate}
        <meshBasicMaterial
          color={isActive ? (isLight ? '#444444' : '#5a5a5a') : (isLight ? '#888888' : '#666666')}
          transparent
          opacity={isActive ? 1 : 0.6}
          depthTest={false}
        />
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
        // Front (+Z)
        result.push({ pos: [wx, floorY, depth / 2 + 0.01], rot: [0, 0, 0] })
        // Back (-Z)
        result.push({ pos: [wx, floorY, -depth / 2 - 0.01], rot: [0, Math.PI, 0] })
      }

      const sSpacing = depth / (windowsPerFace + 1)
      for (let w = 0; w < windowsPerFace; w++) {
        const wz = -depth / 2 + sSpacing * (w + 1)
        // Right (+X)
        result.push({ pos: [width / 2 + 0.01, floorY, wz], rot: [0, Math.PI / 2, 0] })
        // Left (-X)
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

  const bodyColor = isActive
    ? (isLight ? '#ffffff' : '#5a5a5a')
    : (isLight ? '#f0f0f0' : '#2a2a2a')
  const bodyEmissive = isActive
    ? (isLight ? '#eeeeee' : '#333333')
    : '#000000'
  const windowColor = isActive
    ? (isLight ? '#888888' : '#3a3a3a')
    : (isLight ? '#808080' : '#1a1a1a')
  const windowEmissive = isActive
    ? (isLight ? '#666666' : '#222222')
    : (isLight ? '#666666' : '#0a0a0a')
  const ledgeColor = isActive
    ? (isLight ? '#dddddd' : '#4a4a4a')
    : (isLight ? '#d0d0d0' : '#222222')

  return (
    <group position={[x, 0, 0]}>
      {/* Main building body */}
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial
          color={bodyColor}
          emissive={bodyEmissive}
          emissiveIntensity={isActive ? 0.25 : 0}
        />
      </mesh>

      {/* Windows on each floor — recessed planes for fake depth */}
      {windows.map((win, i) => (
        <mesh key={`w-${i}`} position={win.pos} rotation={win.rot} geometry={sharedWindowGeo} scale={[windowWidth, windowHeight, 1]}>
          <meshStandardMaterial
            color={windowColor}
            emissive={windowEmissive}
            emissiveIntensity={isActive ? 0.6 : 0.2}
          />
        </mesh>
      ))}

      {/* Floor divider ledges — shared geometry, scaled per-instance */}
      {ledgeYs.map((y, i) => (
        <mesh key={`l-${i}`} position={[0, y, 0]} geometry={sharedLedgeGeo} scale={[width + 0.08, 0.06, depth + 0.08]}>
          <meshStandardMaterial color={ledgeColor} />
        </mesh>
      ))}

      {/* Floor year labels fixed to the road-facing wall */}
      {Array.from({ length: numFloors }, (_, floor) => {
        // Inner face: building on right (+x) → -X face, building on left (-x) → +X face
        const facingRoad = x > 0 ? -1 : 1
        const labelX = facingRoad * (width / 2 + 0.02)
        const labelZ = depth / 2 - 1.5
        const rotY = facingRoad > 0 ? Math.PI / 2 : -Math.PI / 2

        return (
          <group key={`yr-${floor}`} position={[labelX , floor * floorHeight + floorHeight * 0.15, labelZ]}>
            <Text
              rotation={[0, rotY, 0]}
              fontSize={floorHeight * 0.12}
              fontWeight="bold"
              anchorX={facingRoad > 0 ? 'right' : 'left'}
              anchorY="bottom"
              font={undefined}
            >
              {String(startYear + floor)}
              <meshStandardMaterial
                color={windowColor}
                transparent
                opacity={0.8}
              />
            </Text>
          </group>
        )
      })}
    </group>
  )
})

export function Buildings({ roadLength, experiences, activeExperienceId, theme, onReady }: BuildingsProps) {
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

    // Build exclusion zones around experience buildings so background buildings don't overlap them
    const EXP_W = 5
    const EXP_D = 5
    const MARGIN = 0.03 // minimum gap between any two buildings
    const expZones = experiences.map((exp, index) => {
      const side = index % 2 === 0 ? 1 : -1
      return {
        x: side * (ROAD_WIDTH / 2 + SIDE_OFFSET),
        z: exp.position * roadLength,
        hw: EXP_W / 2,
        hd: EXP_D / 2,
      }
    })

    // Landmark sightline corridors – keep middle/back row buildings from
    // blocking the view of distant landmarks.  Zones are centered far from
    // the road so they only affect buildings at high |X| values.
    const pyramidZ = experiences[0] ? experiences[0].position * roadLength : 0
    expZones.push(
      // Corridor from road toward the pyramids (right side, +X) — wider to match pushed-back pyramids
      { x: 50, z: pyramidZ, hw: 18, hd: 25 },
    )
    if (experiences[4]) {
      const towerZ = experiences[4].position * roadLength - 18
      // Corridor from road toward the TV tower (right side, +X)
      // Wide corridor so buildings don't block the sightline
      expZones.push(
        { x: 30, z: towerZ, hw: 12, hd: 12 },
      )
    }

    // AABB overlap check with margin in the XZ plane
    const overlaps = (cx: number, cz: number, hw: number, hd: number) => {
      // Check against experience buildings
      for (const zone of expZones) {
        if (
          Math.abs(cx - zone.x) < hw + zone.hw + MARGIN &&
          Math.abs(cz - zone.z) < hd + zone.hd + MARGIN
        ) {
          return true
        }
      }
      // Check against already-placed background buildings
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

    // Row definitions: multiple rows create a dense cityscape
    // Each row has its own X band so they don't compete for the same space
    const rows = [
      // Front row: close to road, tallest
      { count: COUNT_PER_SIDE, xMin: ROAD_WIDTH / 2 + SIDE_OFFSET, xRange: 6, wMin: 3, wRange: 5, dMin: 3, dRange: 5, hMin: 4, hRange: 12, seedOffset: 0, zJitter: 3 },
      // Middle row: behind front
      { count: COUNT_PER_SIDE, xMin: ROAD_WIDTH / 2 + SIDE_OFFSET + 8, xRange: 5, wMin: 2, wRange: 4, dMin: 2, dRange: 4, hMin: 3, hRange: 8, seedOffset: 5000, zJitter: 4 },
      // Back row: shorter fill
      { count: COUNT_PER_SIDE, xMin: ROAD_WIDTH / 2 + SIDE_OFFSET + 15, xRange: 5, wMin: 2, wRange: 3, dMin: 2, dRange: 3, hMin: 2, hRange: 6, seedOffset: 10000, zJitter: 5 },
      // Deep row: more fill far back
      { count: COUNT_PER_SIDE, xMin: ROAD_WIDTH / 2 + SIDE_OFFSET + 22, xRange: 6, wMin: 2, wRange: 3, dMin: 2, dRange: 3, hMin: 2, hRange: 5, seedOffset: 15000, zJitter: 5 },
      // Skyline row: distant tall silhouettes for city skyline effect
      { count: Math.floor(COUNT_PER_SIDE * 0.6), xMin: ROAD_WIDTH / 2 + SIDE_OFFSET + 30, xRange: 10, wMin: 3, wRange: 5, dMin: 3, dRange: 5, hMin: 6, hRange: 14, seedOffset: 20000, zJitter: 6 },
    ]

    // Only cap heights near experience buildings that have landmarks behind them
    // (1st = pyramids, 5th = TV tower). Others can have tall buildings.
    const landmarkIndices = [0, 4]
    const heightCapZones = landmarkIndices
      .filter((idx) => experiences[idx])
      .map((idx) => ({
        z: experiences[idx].position * roadLength,
        radius: 12,
        maxH: 8,
      }))

    for (const row of rows) {
      for (let i = 0; i < row.count * 2; i++) {
        const side = i < row.count ? -1 : 1
        const idx = i < row.count ? i : i - row.count
        const ri = i + row.seedOffset
        const w = row.wMin + rand(ri + 3) * row.wRange
        let h = row.hMin + rand(ri + 4) * row.hRange
        const d = row.dMin + rand(ri + 5) * row.dRange

        // Try multiple candidate positions; skip this building if none work
        let placed = false
        for (let attempt = 0; attempt < 20 && !placed; attempt++) {
          const rSeed = attempt * 200
          const x = side * (row.xMin + rand(ri + 1 + rSeed) * row.xRange)
          const z = 2 + idx * (roadLength / row.count) + rand(ri + 2 + rSeed) * row.zJitter

          // Cap height near experience buildings so landmarks stay visible
          h = row.hMin + rand(ri + 4) * row.hRange
          for (const cap of heightCapZones) {
            if (Math.abs(z - cap.z) < cap.radius) {
              h = Math.min(h, cap.maxH)
            }
          }

          if (!overlaps(x, z, w / 2, d / 2)) {
            positions.push([x, h / 2, z])
            scales.push([w, h, d])
            placed = true
          }
        }
      }
    }
    // Compute floor details (ledges + windows) for every placed background building
    const BG_FLOOR_H = 3.5
    const BG_WIN_PER_FACE = 2
    const BG_WIN_WIDTH = 0.5
    const BG_WIN_DEPTH = 0.12

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

      // Horizontal ledges at each floor boundary
      for (let f = 1; f < numFloors; f++) {
        ledgeInstances.push({
          pos: [cx, f * floorH, cz],
          scale: [w + 0.08, 0.06, d + 0.08],
        })
      }

      // Windows on every floor — only the road-facing face, recessed for depth
      for (let f = 0; f < numFloors; f++) {
        const floorY = f * floorH + floorH * 0.55
        const sSpacing = d / (BG_WIN_PER_FACE + 1)
        const innerSide = cx > 0 ? -1 : 1 // face toward road
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
  }, [roadLength, experiences])

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a2a2a' }),
    []
  )

  // Geometry & material for background building floor ledges
  const ledgeGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const ledgeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#222222' }),
    []
  )

  // Geometry & material for background building windows (recessed planes)
  const windowGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  const windowMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#1a1a1a',
        emissive: '#0a0a0a',
        emissiveIntensity: 0.2,
      }),
    []
  )

  useEffect(() => {
    material.color.set(isLight ? '#c0c0c0' : '#2a2a2a')
    material.needsUpdate = true
    ledgeMaterial.color.set(isLight ? '#d0d0d0' : '#222222')
    ledgeMaterial.needsUpdate = true
    windowMaterial.color.set(isLight ? '#808080' : '#1a1a1a')
    windowMaterial.emissive.set(isLight ? '#666666' : '#0a0a0a')
    windowMaterial.needsUpdate = true
  }, [isLight, material, ledgeMaterial, windowMaterial])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  const ledgeRef = useRef<THREE.InstancedMesh>(null)
  const windowRef = useRef<THREE.InstancedMesh>(null)

  // Set body matrices
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

  // Set ledge matrices
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

  // Set window matrices
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

  // Pre-compute all experience building data once (avoids parsing periods every render)
  const expRenderData = useMemo(() => experiences.map((exp, index) => {
    const side = index % 2 === 0 ? 1 : -1
    const x = side * (ROAD_WIDTH / 2 + SIDE_OFFSET)
    const months = parsePeriodMonths(exp.period)
    const buildingHeight = monthsToHeight(months)
    const numFloors = Math.max(Math.ceil(months / 12), 1)
    const startYear = parseInt(exp.period.split('–')[0].trim().split(' ')[1])
    const z = exp.position * roadLength
    return { exp, index, side, x, buildingHeight, numFloors, startYear, z }
  }), [experiences, roadLength])

  // Continuous timeline ticks — batched into a single InstancedMesh
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
    () => new THREE.MeshBasicMaterial({ color: '#444444', transparent: true, opacity: 0.3, depthTest: false }),
    []
  )
  const tickRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    tickMaterial.color.set(isLight ? '#666666' : '#444444')
    tickMaterial.needsUpdate = true
  }, [isLight, tickMaterial])

  useEffect(() => {
    const mesh = tickRef.current
    if (!mesh || timelineTicks.length === 0) return
    for (let i = 0; i < timelineTicks.length; i++) {
      dummy.position.set(tickX, 0.02, timelineTicks[i])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    }
    mesh.count = timelineTicks.length
    mesh.instanceMatrix.needsUpdate = true
  }, [timelineTicks, dummy, tickX])

  // Signal that all instanced meshes are ready
  const readyFired = useRef(false)
  useEffect(() => {
    if (!readyFired.current && positions.length > 0) {
      readyFired.current = true
      onReady?.()
    }
  }, [positions, onReady])

  return (
    <group>
      {/* Continuous timeline tick marks – single instanced draw call */}
      {timelineTicks.length > 0 && (
        <instancedMesh
          ref={tickRef}
          args={[tickGeometry, tickMaterial, timelineTicks.length]}
        />
      )}
      {/* Background building bodies (5 rows × 2 sides) */}
      <instancedMesh
        ref={instancedRef}
        args={[geometry, material, COUNT_PER_SIDE * 12]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      {/* Background building floor ledges */}
      {ledgeInstances.length > 0 && (
        <instancedMesh
          ref={ledgeRef}
          args={[ledgeGeometry, ledgeMaterial, ledgeInstances.length]}
          frustumCulled={false}
        />
      )}
      {/* Background building windows */}
      {windowInstances.length > 0 && (
        <instancedMesh
          ref={windowRef}
          args={[windowGeometry, windowMaterial, windowInstances.length]}
          frustumCulled={false}
        />
      )}
      {/* Egyptian pyramids landmark behind the first experience building (Cairo) */}
      <group position={[0, 0, experiences[0] ? experiences[0].position * roadLength : 0]}>
        <GizaPyramids theme={theme} />
      </group>

      {/* Berlin TV Tower landmark behind the fifth experience building (Babbel) */}
      <group position={[0, 0, experiences[4] ? experiences[4].position * roadLength : 0]}>
        <BerlinTVTower theme={theme} />
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
                <Logo3D
                  logoUrl={exp.logo}
                  isActive={isActive}
                  theme={theme}
                />
              </group>
            )}
            <RoadDateMarking
              period={exp.period}
              isActive={isActive}
              theme={theme}
            />
          </group>
        )
      })}
    </group>
  )
}
