import { useRef, useCallback, useMemo, useEffect, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, SSAO, Noise, Vignette, Bloom } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import type { Experience } from '../data/experiences'
import type { Theme } from '../App'
import type { PerfPreset } from '../utils/devicePerf'
import { Road } from './Road'
import { Buildings } from './Buildings'
import { useHelper } from '@react-three/drei'
import { PointLightHelper } from 'three'

/* ── Gradient sky dome ── */
function SkyGradient({ theme }: { theme: 'light' | 'dark' }) {
  const material = useMemo(() => {
    const isLight = theme === 'light'
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(isLight ? '#c8c8c8' : '#000000') },
        bottomColor: { value: new THREE.Color(isLight ? '#f5f5f5' : '#2a2a2a') },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          vec3 color = mix(bottomColor, topColor, t);
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      glslVersion: THREE.GLSL1,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [theme])

  // Update colors when theme changes
  useEffect(() => {
    const isLight = theme === 'light'
    material.uniforms.topColor.value.set(isLight ? '#c8c8c8' : '#000000')
    material.uniforms.bottomColor.value.set(isLight ? '#f5f5f5' : '#2a2a2a')
  }, [theme, material])

  // Follow camera so it's always surrounding the viewer
  const meshRef = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.copy(state.camera.position)
    }
  })

  return (
    <mesh ref={meshRef} material={material}>
      <sphereGeometry args={[500, 16, 12]} />
    </mesh>
  )
}

/* ── Procedural lens-flare textures ── */
function createFlareTexture(size: number, falloff: number, color: string): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half)
  gradient.addColorStop(0, color)
  gradient.addColorStop(falloff, color.replace(')', ', 0.3)').replace('rgb', 'rgba'))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function createRingTexture(size: number, color: string): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const half = size / 2
  const gradient = ctx.createRadialGradient(half, half, half * 0.6, half, half, half * 0.85)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(0.4, color.replace(')', ', 0.15)').replace('rgb', 'rgba'))
  gradient.addColorStop(0.6, color.replace(')', ', 0.08)').replace('rgb', 'rgba'))
  gradient.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/* ── Sun / Moon — visible celestial body with lens flare, follows camera ── */
const SUN_OFFSET = new THREE.Vector3(15, 70, 10)
const MOON_OFFSET = new THREE.Vector3(-12, 65, 8)

function CelestialBody({ isLight, segments = 16 }: { isLight: boolean; segments?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const flareHost = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (!flareHost.current) return

    const mainColor = isLight ? 'rgb(255,240,220)' : 'rgb(180,200,220)'
    const hexColor = isLight ? 'rgb(255,220,180)' : 'rgb(150,170,200)'

    const texMain = createFlareTexture(256, 0.3, mainColor)
    const texSoft = createFlareTexture(256, 0.6, hexColor)
    const texRing = createRingTexture(256, mainColor)

    const lensflare = new Lensflare()
    if (isLight) {
      lensflare.addElement(new LensflareElement(texMain, 500, 0, new THREE.Color('#ffffff')))
      lensflare.addElement(new LensflareElement(texSoft, 280, 0.1, new THREE.Color('#fff8ee')))
      lensflare.addElement(new LensflareElement(texRing, 320, 0.25, new THREE.Color('#ffe8cc')))
      lensflare.addElement(new LensflareElement(texSoft, 200, 0.4, new THREE.Color('#ffd8a8')))
      lensflare.addElement(new LensflareElement(texRing, 240, 0.6, new THREE.Color('#ffeedd')))
      lensflare.addElement(new LensflareElement(texSoft, 150, 0.8, new THREE.Color('#ffe0bb')))
    } else {
      lensflare.addElement(new LensflareElement(texMain, 320, 0, new THREE.Color('#e0e8f4')))
      lensflare.addElement(new LensflareElement(texSoft, 180, 0.15, new THREE.Color('#c8d8e8')))
      lensflare.addElement(new LensflareElement(texRing, 220, 0.35, new THREE.Color('#a0b8d0')))
      lensflare.addElement(new LensflareElement(texSoft, 120, 0.55, new THREE.Color('#8898b0')))
      lensflare.addElement(new LensflareElement(texRing, 150, 0.8, new THREE.Color('#708098')))
    }

    flareHost.current.add(lensflare)

    return () => {
      flareHost.current?.remove(lensflare)
      lensflare.dispose()
      texMain.dispose()
      texSoft.dispose()
      texRing.dispose()
    }
  }, [isLight])

  useFrame((state) => {
    if (!groupRef.current) return
    const cam = state.camera.position
    const offset = isLight ? SUN_OFFSET : MOON_OFFSET
    groupRef.current.position.set(cam.x + offset.x, offset.y, cam.z + offset.z)
  })

  const bodyRadius = isLight ? 3 : 2.2

  return (
    <group ref={groupRef}>
      {/* Point light from celestial body */}
      <pointLight
        color={isLight ? '#ffffff' : '#cccccc'}
        intensity={isLight ? 3.5 : 1.8}
        distance={250}
        // decay={1}
        castShadow
      />
      {/* Glowing sphere */}
      <mesh ref={flareHost}>
        <sphereGeometry args={[bodyRadius, segments, segments]} />
        <meshStandardMaterial color={isLight ? '#ffffff' : '#e8ecf4'} toneMapped={false} />
      </mesh>
      {/* Inner glow halo */}
      <mesh>
        <sphereGeometry args={[bodyRadius * 1.4, segments, segments]} />
        <meshStandardMaterial
          color={isLight ? '#fffae8' : '#c8d4e4'}
          transparent
          opacity={isLight ? 0.3 : 0.15}
          toneMapped={false}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Outer glow halo */}
      <mesh>
        <sphereGeometry args={[bodyRadius * 2.2, segments, segments]} />
        <meshStandardMaterial
          color={isLight ? '#fff0d0' : '#a0b0c8'}
          transparent
          opacity={isLight ? 0.12 : 0.06}
          toneMapped={false}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Moon craters */}
      {!isLight && (
        <>
          <mesh position={[-0.5, 0.6, 2]}>
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshStandardMaterial color="#b8bcc8" toneMapped={false} />
          </mesh>
          <mesh position={[0.8, -0.3, 1.8]}>
            <sphereGeometry args={[0.3, 8, 8]} />
            <meshStandardMaterial color="#b0b4c0" toneMapped={false} />
          </mesh>
          <mesh position={[-0.2, -0.7, 2]}>
            <sphereGeometry args={[0.25, 8, 8]} />
            <meshStandardMaterial color="#aeb2be" toneMapped={false} />
          </mesh>
        </>
      )}
    </group>
  )
}

const ROAD_LENGTH = 250
const CAMERA_HEIGHT = 8
const LOOK_AHEAD = 45
const ROAD_WIDTH = 10
const SIDE_OFFSET = 8

/* ── Moon-like light at end of road, in line with road surface (horizon) ── */
const END_LIGHT_HEIGHT = 45

function EndOfRoadLight({ theme, segments = 12 }: { theme: 'light' | 'dark'; segments?: number }) {
  const position: [number, number, number] = [-20, END_LIGHT_HEIGHT, ROAD_LENGTH]
  const lightRef = useRef<THREE.PointLight>(null)
  useHelper(lightRef as MutableRefObject<THREE.Object3D>, PointLightHelper, 1, 'red')

  return (
    <group position={position}>
      <pointLight
        // ref={lightRef}
        color={theme === 'light' ? '#e0e4ec' : '#b8c0d0'}
        intensity={theme === 'light' ? 5000 : 5000}
        castShadow
        // distance={400}
        // decay={9}
      />
    </group>
  )
}

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

function monthsToHeight(months: number): number {
  const MIN_HEIGHT = 4
  const MAX_HEIGHT = 16
  const t = Math.min(Math.max(months, 6), 48)
  return MIN_HEIGHT + ((t - 6) / (48 - 6)) * (MAX_HEIGHT - MIN_HEIGHT)
}

const THEME_COLORS = {
  dark: {
    background: '#1a1a1a',
    fog: '#1a1a1a',
  },
  light: {
    background: '#f5f5f5',
    fog: '#f5f5f5',
  },
}

interface SceneProps {
  scrollProgress: number
  experiences: Experience[]
  activeExperienceId: string | null
  theme: Theme
  perf: PerfPreset
  onReady?: () => void
}

export function Scene({ scrollProgress, experiences, activeExperienceId, theme, perf, onReady }: SceneProps) {
  const { camera, gl } = useThree()

  // Clamp pixel ratio to perf tier's max
  useEffect(() => {
    const maxDpr = perf.dpr[1]
    const deviceDpr = window.devicePixelRatio || 1
    gl.setPixelRatio(Math.min(deviceDpr, maxDpr))
  }, [gl, perf.dpr])

  const smoothProgress = useRef(0)
  const smoothLookAt = useRef(new THREE.Vector3(0, 0, LOOK_AHEAD))
  const readyFired = useRef(false)
  const frameCount = useRef(0)
  const buildingsReady = useRef(false)

  // Pre-allocate reusable vectors (avoid GC pressure from per-frame allocations)
  const _targetLookAt = useRef(new THREE.Vector3())
  const _targetCameraPos = useRef(new THREE.Vector3())
  const _currentCameraPos = useRef(new THREE.Vector3())
  const _defaultLookAt = useRef(new THREE.Vector3())

  // Pre-compute experience data so we don't call find/findIndex/parse every frame
  const expLookup = useMemo(() => {
    const map = new Map<string, { exp: Experience; index: number; buildingHeight: number }>()
    for (let i = 0; i < experiences.length; i++) {
      const exp = experiences[i]
      const months = parsePeriodMonths(exp.period)
      map.set(exp.id, { exp, index: i, buildingHeight: monthsToHeight(months) })
    }
    return map
  }, [experiences])

  const colors = THEME_COLORS[theme]

  const handleBuildingsReady = useCallback(() => {
    buildingsReady.current = true
  }, [])

  // Wait for buildings to finish + a few rendered frames before signaling ready
  useFrame(() => {
    if (!readyFired.current && buildingsReady.current) {
      frameCount.current++
      if (frameCount.current >= 5) {
        readyFired.current = true
        onReady?.()
      }
    }
  })

  // Cache vFov since it won't change
  const vFov = useMemo(() => THREE.MathUtils.degToRad(95), [])

  useFrame((_, delta) => {
    const activeData = activeExperienceId ? expLookup.get(activeExperienceId) : null

    const lerpSpeed = activeData ? 1.5 : 4
    smoothProgress.current += (scrollProgress - smoothProgress.current) * Math.min(delta * lerpSpeed, 1)
    const z = smoothProgress.current * ROAD_LENGTH

    if (activeData) {
      const { exp: activeExp, index: buildingIndex, buildingHeight } = activeData
      const buildingZ = activeExp.position * ROAD_LENGTH
      const side = buildingIndex % 2 === 0 ? 1 : -1
      const buildingX = side * (ROAD_WIDTH / 2 + SIDE_OFFSET)

      const LOGO_OFFSET = 6
      const LOGO_SIGN_HEIGHT_ESTIMATE = 3
      const totalHeight = buildingHeight + LOGO_OFFSET + LOGO_SIGN_HEIGHT_ESTIMATE
      const lookAtY = totalHeight / 2

      // Focus on a point beside the building (shifted outward) so the building is off-center in frame
      const LOOK_AT_SIDE_OFFSET = -6
      const lookAtX = buildingX + side * LOOK_AT_SIDE_OFFSET
      _targetLookAt.current.set(lookAtX, lookAtY, buildingZ)
      smoothLookAt.current.lerp(_targetLookAt.current, Math.min(delta * 2, 1))

      const margin = 0.7
      const requiredDist = (totalHeight * margin) / (2 * Math.tan(vFov / 2))

      const cameraOffsetX = side * -(requiredDist * 0.45)
      const cameraOffsetZ = -(requiredDist * 0.95)
      const cameraOffsetY = lookAtY + requiredDist * 0.09
      _targetCameraPos.current.set(cameraOffsetX, cameraOffsetY, buildingZ + cameraOffsetZ)
      // Lerp from the camera's actual current position — NOT the road position.
      _currentCameraPos.current.copy(camera.position)
      _currentCameraPos.current.lerp(_targetCameraPos.current, Math.min(delta * 2, 1))
      camera.position.copy(_currentCameraPos.current)
    } else {
      camera.position.set(0, CAMERA_HEIGHT, z)
      _defaultLookAt.current.set(0, 0, z + LOOK_AHEAD)
      smoothLookAt.current.lerp(_defaultLookAt.current, Math.min(delta * 2, 1))
    }

    ;(camera as THREE.PerspectiveCamera).lookAt(smoothLookAt.current)

  })

  return (
    <>
      {theme === 'dark' ? <SkyGradient theme={theme} /> : <color attach="background" args={['#f5f5f5']} />}
      <fog attach="fog" args={[colors.fog, 100, 1000]} />
      <fogExp2 attach="fog" args={[colors.fog, theme === 'light' ? 0.014 : 0.027]} />
      {/* Ambient fill */}
      <ambientLight intensity={theme === 'light' ? 0.2 : 0.5} />
      {/* Primary directional light aligned with sun/moon direction */}
      <directionalLight
        position={theme === 'light' ? [15, 70, 10] : [-12, 65, 8]}
        intensity={theme === 'light' ? 2.0 : 1.5}
        color={theme === 'light' ? '#efefef' : '#cacaca'}
        castShadow
        shadow-mapSize-width={perf.shadowMapSize}
        shadow-mapSize-height={perf.shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={100}
        shadow-camera-left={0}
        shadow-camera-right={0}
        shadow-camera-top={25}
        shadow-camera-bottom={-25}
        shadow-bias={-0.0003}
        shadow-normalBias={0.01}
      />
      {/* Fill from opposite side */}
      <directionalLight
        position={theme === 'light' ? [-10, 15, -5] : [10, 15, -5]}
        intensity={theme === 'light' ? 0.55 : 0.4}
        castShadow
      />
      {/* Sun / Moon with lens flare */}
      <CelestialBody isLight={theme === 'light'} segments={perf.celestialSegments} />
      <Road length={ROAD_LENGTH} theme={theme} />
      {/* Moon-like light at end of road, in line with road surface */}
      <EndOfRoadLight theme={theme} segments={perf.celestialSegments} />
      <Buildings
        roadLength={ROAD_LENGTH}
        experiences={experiences}
        activeExperienceId={activeExperienceId}
        theme={theme}
        perf={perf}
        onReady={handleBuildingsReady}
      />
      <EffectComposer multisampling={0} enableNormalPass={perf.enableSSAO}>
        {perf.enableSSAO ? (
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={perf.ssaoSamples}
            radius={0.9}
            intensity={40}
            luminanceInfluence={0.9}
            worldDistanceThreshold={12}
            worldDistanceFalloff={3}
            worldProximityThreshold={0.8}
            worldProximityFalloff={0.2}
          />
        ) : <></>}
        {perf.enableBloom ? (
          <Bloom
            intensity={theme === 'light' ? 0.2 : 0.9}
            luminanceThreshold={theme === 'light' ? 0.6 : 0.35}
            luminanceSmoothing={0.3}
            mipmapBlur
          />
        ) : <></>}
        <Vignette
          offset={theme === 'light' ? 0.40 : 0.35}
          darkness={theme === 'light' ? 0.45 : 0.5}
          blendFunction={BlendFunction.NORMAL}
        />
        {/* <Noise
          blendFunction={BlendFunction.ALPHA}
          opacity={perf.tier === 'low' ? 0.05 : (theme === 'light' ? 0.005 : 0.01)}
        /> */}
      </EffectComposer>
    </>
  )
}
