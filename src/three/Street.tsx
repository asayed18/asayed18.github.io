import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Theme } from '../theme'
import { ROAD_WIDTH, SIDEWALK_WIDTH } from './config'
import { ROAD_LEAD_IN, ROAD_LEAD_OUT, ROAD_LENGTH, roadFrame } from './path'
import { sweepProfile } from './sweep'

/** Distance between two street lamps on the same side. */
const LAMP_SPACING = 14
const LAMP_HEIGHT = 4.2
const ARM_LENGTH = 1.1
const CURB_HEIGHT = 0.14

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const POLE = new THREE.CylinderGeometry(0.05, 0.08, 1, 8)
POLE.translate(0, 0.5, 0)

/** Radial falloff for the pool of light under each lamp. */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

interface StreetProps {
  theme: Theme
}

/** Length of one dash of the centre line, and of the gap after it. */
const DASH = 3
const DASH_GAP = 4

/**
 * Sidewalks with curbs and a row of street lamps on both sides of the road. All lamps share four
 * instanced draws. They add no real lights (a light per lamp would cost far too much): the lamp
 * heads glow through the bloom pass and a soft additive decal lights the road below them.
 */
export const Street = memo(function Street({ theme }: StreetProps) {
  const isLight = theme === 'light'

  const lamps = useMemo(() => {
    const result: { side: number; frame: ReturnType<typeof roadFrame> }[] = []
    for (let d = 6 - ROAD_LEAD_IN; d < ROAD_LENGTH + ROAD_LEAD_OUT - 4; d += LAMP_SPACING) {
      result.push({ side: 1, frame: roadFrame(d) })
      // Staggered on the other side, like a real street.
      result.push({ side: -1, frame: roadFrame(d + LAMP_SPACING / 2) })
    }
    return result
  }, [])

  // Sidewalks with their curbs, and the painted lines, swept along the curve of the road.
  const geometries = useMemo(() => {
    const hw = ROAD_WIDTH / 2
    const range = { from: -ROAD_LEAD_IN, to: ROAD_LENGTH + ROAD_LEAD_OUT, step: 1 }
    const sidewalk = sweepProfile(
      [
        { l0: hw, y0: 0, l1: hw, y1: CURB_HEIGHT },
        { l0: hw, y0: CURB_HEIGHT, l1: hw + SIDEWALK_WIDTH, y1: CURB_HEIGHT },
        { l0: -hw, y0: CURB_HEIGHT, l1: -hw, y1: 0 },
        { l0: -hw - SIDEWALK_WIDTH, y0: CURB_HEIGHT, l1: -hw, y1: CURB_HEIGHT },
      ],
      { ...range, tile: 1.2 }
    )
    const line = hw - 0.35
    const edges = sweepProfile(
      [
        { l0: line - 0.06, y0: 0.004, l1: line + 0.06, y1: 0.004 },
        { l0: -line - 0.06, y0: 0.004, l1: -line + 0.06, y1: 0.004 },
      ],
      range
    )
    const centre = sweepProfile([{ l0: -0.07, y0: 0.004, l1: 0.07, y1: 0.004 }], {
      ...range,
      step: 0.5,
      keep: (d) => ((d % (DASH + DASH_GAP)) + DASH + DASH_GAP) % (DASH + DASH_GAP) < DASH,
    })
    return { sidewalk, edges, centre }
  }, [])
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])

  const materials = useMemo(
    () => ({
      sidewalk: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      paint: new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: true, opacity: 0.55 }),
      metal: new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.6 }),
      head: new THREE.MeshStandardMaterial({ roughness: 0.3 }),
      glow: new THREE.MeshBasicMaterial({
        map: createGlowTexture(),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    }),
    []
  )
  useEffect(
    () => () => {
      materials.glow.map?.dispose()
      Object.values(materials).forEach((m) => m.dispose())
    },
    [materials]
  )

  useLayoutEffect(() => {
    materials.sidewalk.color.set(isLight ? '#d4d4d4' : '#1c1c1c')
    materials.paint.color.set(isLight ? '#f4f4f4' : '#8a8a8a')
    materials.metal.color.set(isLight ? '#5a5a5a' : '#2a2a2a')
    materials.head.color.set(isLight ? '#e6e6e6' : '#ffffff')
    materials.head.emissive.set(isLight ? '#000000' : '#ffffff')
    materials.head.emissiveIntensity = isLight ? 0 : 2.2
    materials.glow.color.set('#ffffff')
    materials.glow.opacity = isLight ? 0 : 0.16
    materials.glow.visible = !isLight
  }, [isLight, materials])

  const poleRef = useRef<THREE.InstancedMesh>(null)
  const armRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const dummy = new THREE.Object3D()
    const base = new THREE.Matrix4()
    const up = new THREE.Vector3(0, 1, 0)
    const set = (
      mesh: THREE.InstancedMesh | null,
      fill: (i: number, lamp: { x: number; side: number }) => void
    ) => {
      if (!mesh) return
      lamps.forEach((lamp, i) => {
        dummy.position.set(0, 0, 0)
        dummy.rotation.set(0, 0, 0)
        dummy.scale.set(1, 1, 1)
        // Laid out in the road's own frame: x across the road, z along it.
        fill(i, { x: lamp.side * (ROAD_WIDTH / 2 + 0.45), side: lamp.side })
        dummy.updateMatrix()
        base.makeRotationAxis(up, lamp.frame.yaw).setPosition(lamp.frame.point)
        mesh.setMatrixAt(i, base.multiply(dummy.matrix))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.computeBoundingSphere()
    }
    set(poleRef.current, (_, l) => {
      dummy.position.set(l.x, CURB_HEIGHT, 0)
      dummy.scale.set(1, LAMP_HEIGHT, 1)
    })
    set(armRef.current, (_, l) => {
      dummy.position.set(l.x - (l.side * ARM_LENGTH) / 2, CURB_HEIGHT + LAMP_HEIGHT - 0.04, 0)
      dummy.scale.set(ARM_LENGTH, 0.06, 0.08)
    })
    set(headRef.current, (_, l) => {
      dummy.position.set(l.x - l.side * (ARM_LENGTH - 0.15), CURB_HEIGHT + LAMP_HEIGHT - 0.12, 0)
      dummy.scale.set(0.5, 0.08, 0.22)
    })
    set(glowRef.current, (_, l) => {
      dummy.position.set(l.x - l.side * (ARM_LENGTH - 0.15), 0.02, 0)
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.set(7, 7, 1)
    })
  }, [lamps])

  const glowGeometry = useMemo(() => new THREE.PlaneGeometry(1, 1), [])
  useEffect(() => () => glowGeometry.dispose(), [glowGeometry])

  return (
    <group>
      <mesh geometry={geometries.sidewalk} material={materials.sidewalk} receiveShadow />
      <mesh geometry={geometries.edges} material={materials.paint} receiveShadow />
      <mesh geometry={geometries.centre} material={materials.paint} receiveShadow />
      <instancedMesh ref={poleRef} args={[POLE, materials.metal, lamps.length]} castShadow />
      <instancedMesh ref={armRef} args={[UNIT_BOX, materials.metal, lamps.length]} />
      <instancedMesh ref={headRef} args={[UNIT_BOX, materials.head, lamps.length]} />
      <instancedMesh ref={glowRef} args={[glowGeometry, materials.glow, lamps.length]} renderOrder={1} />
    </group>
  )
})
