import { useEffect, useMemo, useRef, Suspense } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js'
import { END_LIGHT_HEIGHT, ROAD_LENGTH } from './config'

const MOON_TEXTURE_URL = '/textures/moon.png'

export const SUN_OFFSET = new THREE.Vector3(12, 52, 28)
export const MOON_OFFSET = new THREE.Vector3(-10, 42, 32)
const SUN_DIR = SUN_OFFSET.clone().normalize()
const MOON_DIR = MOON_OFFSET.clone().normalize()

/* Monochromatic gradient sky with realistic clouds, matching colors, subtle motion, moon lit */
export function SkyGradient({ theme }: { theme: 'light' | 'dark' }) {
  const celestialDirRef = useRef(new THREE.Vector3())
  const material = useMemo(() => {
    const isLight = theme === 'light'
    celestialDirRef.current.copy(isLight ? SUN_DIR : MOON_DIR)
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(isLight ? '#b0b0b0' : '#0d0d0d') },
        bottomColor: { value: new THREE.Color(isLight ? '#e8e8e8' : '#1a1a1a') },
        celestialDir: { value: celestialDirRef.current },
        moonHighlight: { value: new THREE.Color(isLight ? '#e0e0e0' : '#383838') },
        iTime: { value: 0 },
        uSphereRadius: { value: 500.0 },
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
        uniform vec3 celestialDir;
        uniform vec3 moonHighlight;
        uniform float iTime;
        uniform float uSphereRadius;
        varying vec3 vWorldPosition;

        float hash(vec3 p) {
          p = fract(p * 443.8975);
          p += dot(p.zxy, p.yxz + 19.27);
          return fract(p.x * p.y * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
          );
        }
        float fbmLarge(vec3 p) {
          float v = 0.0;
          v += 0.6 * noise3(p);
          v += 0.35 * noise3(p * 2.0 + 10.0);
          v += 0.12 * noise3(p * 4.0 + 20.0);
          return v;
        }

        void main() {
          vec3 n = normalize(vWorldPosition);
          float h = n.y;
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          vec3 color = mix(bottomColor, topColor, t);

          float nearRadius = 380.0;
          float farRadius = 500.0;
          float tDist = clamp((uSphereRadius - nearRadius) / (farRadius - nearRadius), 0.0, 1.0);
          float cloudScale = mix(24.0, 7.0, tDist);
          vec3 uv = n * cloudScale;
          uv.x += iTime * 0.12;
          uv.z += iTime * 0.08;
          float nval = fbmLarge(uv);
          float cloud = smoothstep(0.42, 0.58, nval);
          float horizonFade = smoothstep(-0.15, 0.35, h);
          cloud *= horizonFade;
          float cloudSoft = smoothstep(0.38, 0.62, nval) * horizonFade * 0.7;
          float cloudMask = cloud * 0.5 + cloudSoft * 0.25;

          vec3 cloudColor = color * 1.08;
          color = mix(color, cloudColor, cloudMask);

          float facing = max(0.0, dot(n, celestialDir));
          float moonLit = cloudMask * facing * facing * 0.35;
          color = mix(color, moonHighlight, moonLit);

          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      glslVersion: THREE.GLSL1,
      side: THREE.BackSide,
      depthWrite: false,
    })
  }, [theme])

  useEffect(() => {
    const isLight = theme === 'light'
    material.uniforms.topColor.value.set(isLight ? '#b0b0b0' : '#0d0d0d')
    material.uniforms.bottomColor.value.set(isLight ? '#e8e8e8' : '#1a1a1a')
    celestialDirRef.current.copy(isLight ? SUN_DIR : MOON_DIR)
    material.uniforms.celestialDir.value.copy(celestialDirRef.current)
    material.uniforms.moonHighlight.value.set(isLight ? '#e0e0e0' : '#383838')
  }, [theme, material])

  const innerMaterial = useMemo(() => {
    const isLight = theme === 'light'
    return new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(isLight ? '#b0b0b0' : '#0d0d0d') },
        bottomColor: { value: new THREE.Color(isLight ? '#e8e8e8' : '#1a1a1a') },
        iTime: { value: 0 },
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
        uniform float iTime;
        varying vec3 vWorldPosition;
        float hash(vec3 p) {
          p = fract(p * 443.8975);
          p += dot(p.zxy, p.yxz + 19.27);
          return fract(p.x * p.y * p.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
          );
        }
        float fbmLarge(vec3 p) {
          float v = 0.0;
          v += 0.6 * noise3(p);
          v += 0.35 * noise3(p * 2.0 + 10.0);
          v += 0.12 * noise3(p * 4.0 + 20.0);
          return v;
        }
        void main() {
          vec3 n = normalize(vWorldPosition);
          float h = n.y;
          float t = clamp(h * 0.5 + 0.5, 0.0, 1.0);
          vec3 skyColor = mix(bottomColor, topColor, t);
          float cloudScale = 24.0;
          vec3 uv = n * cloudScale;
          uv.x += iTime * 0.12;
          uv.z += iTime * 0.08;
          float nval = fbmLarge(uv);
          float cloud = smoothstep(0.42, 0.58, nval);
          float horizonFade = smoothstep(-0.15, 0.35, h);
          cloud *= horizonFade;
          float cloudSoft = smoothstep(0.38, 0.62, nval) * horizonFade * 0.7;
          float cloudMask = (cloud * 0.5 + cloudSoft * 0.25) * 0.65;
          vec3 cloudColor = skyColor * 1.08;
          gl_FragColor = vec4(cloudColor, cloudMask);
          #include <colorspace_fragment>
        }
      `,
      glslVersion: THREE.GLSL1,
      side: THREE.BackSide,
      depthWrite: false,
      transparent: true,
    })
  }, [theme])

  useEffect(() => {
    innerMaterial.uniforms.topColor.value.copy(material.uniforms.topColor.value)
    innerMaterial.uniforms.bottomColor.value.copy(material.uniforms.bottomColor.value)
  }, [theme, material, innerMaterial])

  const meshRef = useRef<THREE.Mesh>(null)
  const innerMeshRef = useRef<THREE.Mesh>(null)
  useFrame((state, delta) => {
    material.uniforms.iTime.value += delta
    innerMaterial.uniforms.iTime.value += delta
    if (meshRef.current) meshRef.current.position.copy(state.camera.position)
    if (innerMeshRef.current) innerMeshRef.current.position.copy(state.camera.position)
  })

  return (
    <>
      <mesh ref={meshRef} material={material} frustumCulled={false}>
        <sphereGeometry args={[500, 12, 8]} />
      </mesh>
      <mesh ref={innerMeshRef} material={innerMaterial} frustumCulled={false}>
        <sphereGeometry args={[380, 12, 8]} />
      </mesh>
    </>
  )
}

/* Procedural lens-flare textures */
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

function RealisticMoon({ radius, segments }: { radius: number; segments: number }) {
  const map = useTexture(MOON_TEXTURE_URL)
  useEffect(() => {
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping
    map.colorSpace = THREE.SRGBColorSpace
  }, [map])
  return (
    <>
      <mesh renderOrder={1000}>
        <sphereGeometry args={[radius, segments, segments]} />
        <meshStandardMaterial
          map={map}
          roughness={0.95}
          metalness={0.02}
          emissive="#0a0a0a"
          emissiveIntensity={0.08}
          toneMapped={true}
        />
      </mesh>
      <mesh renderOrder={999}>
        <sphereGeometry args={[radius * 1.25, segments, segments]} />
        <meshBasicMaterial
          color="#707070"
          transparent
          opacity={0.06}
          depthWrite={false}
          side={THREE.BackSide}
        />
      </mesh>
    </>
  )
}

export function CelestialBody({ isLight, segments = 16 }: { isLight: boolean; segments?: number }) {
  const groupRef = useRef<THREE.Group>(null)
  const flareHost = useRef<THREE.Mesh>(null)
  const discRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    if (!flareHost.current || !isLight) return

    const mainColor = 'rgb(255,255,255)'
    const hexColor = 'rgb(248,248,248)'

    const texMain = createFlareTexture(256, 0.3, mainColor)
    const texSoft = createFlareTexture(256, 0.6, hexColor)
    const texRing = createRingTexture(256, mainColor)

    const lensflare = new Lensflare()
    lensflare.addElement(new LensflareElement(texMain, 280, 0, new THREE.Color('#ffffff')))
    lensflare.addElement(new LensflareElement(texSoft, 160, 0.1, new THREE.Color('#f8f8f8')))
    lensflare.addElement(new LensflareElement(texRing, 180, 0.25, new THREE.Color('#eeeeee')))
    lensflare.addElement(new LensflareElement(texSoft, 110, 0.4, new THREE.Color('#e5e5e5')))
    lensflare.addElement(new LensflareElement(texRing, 130, 0.6, new THREE.Color('#e8e8e8')))
    lensflare.addElement(new LensflareElement(texSoft, 85, 0.8, new THREE.Color('#e0e0e0')))

    flareHost.current.add(lensflare)

    return () => {
      flareHost.current?.remove(lensflare)
      lensflare.dispose()
      texMain.dispose()
      texSoft.dispose()
      texRing.dispose()
    }
  }, [isLight])

  const _pos = useRef(new THREE.Vector3())
  useFrame((state) => {
    if (!groupRef.current) return
    const cam = state.camera.position
    const skyY = isLight ? 30 : 16
    const ahead = 55
    _pos.current.set(0, cam.y + skyY, cam.z + ahead)
    groupRef.current.position.copy(_pos.current)
    if (discRef.current) {
      discRef.current.lookAt(cam.x, cam.y, cam.z)
    }
  })

  const bodyRadius = isLight ? 2.6 : 2.4
  const discRadius = isLight ? 3.4 : 3.5

  return (
    <group ref={groupRef} frustumCulled={false}>
      <pointLight
        color={isLight ? '#ffffff' : '#e0e0e0'}
        intensity={isLight ? 2.9 : 2.8}
        distance={350}
        decay={1.8}
        castShadow
      />
      {isLight ? (
        <>
          <mesh ref={discRef} renderOrder={1000}>
            <circleGeometry args={[discRadius, 32]} />
            <meshBasicMaterial
              color="#fafafa"
              toneMapped={false}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh ref={flareHost} renderOrder={1000}>
            <sphereGeometry args={[bodyRadius, segments, segments]} />
            <meshBasicMaterial color="#fafafa" toneMapped={false} depthWrite={false} />
          </mesh>
          <mesh renderOrder={999}>
            <sphereGeometry args={[bodyRadius * 1.4, segments, segments]} />
            <meshStandardMaterial
              color="#f2f2f2"
              transparent
              opacity={0.3}
              toneMapped={false}
              side={THREE.BackSide}
            />
          </mesh>
          <mesh renderOrder={999}>
            <sphereGeometry args={[bodyRadius * 2.2, segments, segments]} />
            <meshStandardMaterial
              color="#eeeeee"
              transparent
              opacity={0.12}
              toneMapped={false}
              side={THREE.BackSide}
            />
          </mesh>
        </>
      ) : (
        <Suspense
          fallback={
            <mesh renderOrder={1000}>
              <sphereGeometry args={[bodyRadius, segments, segments]} />
              <meshBasicMaterial color="#b0b0b0" toneMapped={false} depthWrite={false} />
            </mesh>
          }
        >
          <RealisticMoon radius={bodyRadius} segments={segments} />
        </Suspense>
      )}
    </group>
  )
}

export function EndOfRoadLight({ theme }: { theme: 'light' | 'dark'; segments?: number }) {
  const position: [number, number, number] = [-20, END_LIGHT_HEIGHT, ROAD_LENGTH]

  return (
    <group position={position}>
      <pointLight
        color={theme === 'light' ? '#e0e0e0' : '#b8b8b8'}
        intensity={theme === 'light' ? 5000 : 5000}
        castShadow
      />
    </group>
  )
}
