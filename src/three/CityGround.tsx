import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useTexture } from '@react-three/drei'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Theme } from '../theme'
import type { DetailBox, GroundPatch, Tree } from './cityLayout'
import { groundAOCompile, groundAOKey } from './groundAO'

/** Side streets sit just under the avenue's asphalt, the lawns just under the side streets. */
const STREET_Y = -0.04
const LAWN_Y = -0.045
/** World units per asphalt texture tile, as on the avenue. */
const STREET_TILE = 2.5

/** Flat rectangles merged into one geometry, with UVs in world units / `tile`. */
function patchGeometry(patches: GroundPatch[], y: number, tile: number): THREE.BufferGeometry {
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  for (const p of patches) {
    const c = Math.cos(p.yaw)
    const s = Math.sin(p.yaw)
    const base = positions.length / 3
    for (const [lx, lz] of [
      [-p.width / 2, -p.length / 2],
      [p.width / 2, -p.length / 2],
      [p.width / 2, p.length / 2],
      [-p.width / 2, p.length / 2],
    ]) {
      const x = p.x + lx * c + lz * s
      const z = p.z - lx * s + lz * c
      positions.push(x, y, z)
      // Along the street the texture runs with the street; across it, it stays put.
      uvs.push(lx / tile, lz / tile)
    }
    // Counter-clockwise seen from above, so the face points up.
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(indices)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

/** Deterministic pseudo-random numbers for the tree geometry. */
function seeded(seed: number) {
  let t = seed
  return () => {
    t = (t * 16807) % 2147483647
    return (t - 1) / 2147483646
  }
}

/**
 * A cluster of leaves painted on a canvas, in grey (the instance colour tints it): hundreds of
 * small leaves, denser and lighter towards the middle, ragged at the edge. Crowns are built from
 * many such cards, which gives them a broken, leafy outline instead of a blob.
 */
function createLeafTexture(): THREE.CanvasTexture {
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rnd = seeded(7)
  // Twigs of leaves with sky showing between them: lit leaves on top of each twig, shaded ones
  // underneath, so the crown has visible leaf texture up close.
  for (let c = 0; c < 14; c++) {
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(rnd()) * size * 0.32
    const cx = size / 2 + Math.cos(a) * r
    const cy = size / 2 + Math.sin(a) * r
    const spread = size * (0.07 + rnd() * 0.06)
    for (let i = 0; i < 70; i++) {
      const la = rnd() * Math.PI * 2
      const lr = Math.sqrt(rnd()) * spread
      const x = cx + Math.cos(la) * lr
      const y = cy + Math.sin(la) * lr
      // Lighter towards the top of each twig, where the sun reaches.
      const up = 1 - (y - (cy - spread)) / (2 * spread)
      const g = Math.round(150 + up * 70 + rnd() * 35)
      ctx.fillStyle = `rgb(${g},${g},${g})`
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rnd() * Math.PI)
      ctx.beginPath()
      ctx.ellipse(0, 0, 4 + rnd() * 3, 2 + rnd() * 1.5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/**
 * The crown: leaf cards scattered through an ellipsoid. Their normals point away from the centre
 * of the crown, so light wraps around it like a real canopy, and cards low and deep in the crown
 * are darker (the foliage shading itself).
 */
function createCrownGeometry(): THREE.BufferGeometry {
  const rnd = seeded(3)
  const cards: THREE.BufferGeometry[] = []
  const centre = new THREE.Vector3(0, -0.15, 0)
  for (let i = 0; i < 36; i++) {
    const card = new THREE.PlaneGeometry(1.25, 1.25)
    const dir = new THREE.Vector3(rnd() * 2 - 1, rnd() * 1.6 - 0.6, rnd() * 2 - 1).normalize()
    const depth = 0.3 + rnd() * 0.5
    const pos = dir.clone().multiply(new THREE.Vector3(1, 0.8, 1)).multiplyScalar(depth)
    card.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI)))
    card.translate(pos.x, pos.y, pos.z)
    const p = card.getAttribute('position') as THREE.BufferAttribute
    const n = card.getAttribute('normal') as THREE.BufferAttribute
    const colors = new Float32Array(p.count * 3)
    const v = new THREE.Vector3()
    for (let k = 0; k < p.count; k++) {
      v.fromBufferAttribute(p, k)
      const out = v.clone().sub(centre).normalize()
      n.setXYZ(k, out.x, out.y, out.z)
      const height = THREE.MathUtils.clamp((v.y + 0.9) / 1.7, 0, 1)
      const shade = (0.62 + 0.38 * height) * (0.82 + 0.18 * depth)
      colors.set([shade, shade, shade], k * 3)
    }
    card.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    cards.push(card)
  }
  return mergeGeometries(cards)!
}

/** Trunk, splitting into three limbs that disappear into the crown. */
function createTrunkGeometry(): THREE.BufferGeometry {
  const parts = [new THREE.CylinderGeometry(0.07, 0.13, 1, 7).translate(0, 0.5, 0)]
  for (let i = 0; i < 3; i++) {
    const limb = new THREE.CylinderGeometry(0.03, 0.06, 0.45, 5).translate(0, 0.22, 0)
    limb.rotateZ(0.6)
    limb.rotateY((i / 3) * Math.PI * 2)
    limb.translate(0, 0.85, 0)
    parts.push(limb)
  }
  return mergeGeometries(parts)!
}

const TRUNK = createTrunkGeometry()

const withGroundAO = { onBeforeCompile: groundAOCompile, customProgramCacheKey: groundAOKey }

/** Muted greens of city trees: plane, lime, linden, a few darker oaks. */
const CROWN_GREENS = ['#8fae5e', '#9cb468', '#7f9e57', '#a6bb6f', '#749449', '#8ca65a']

interface CityGroundProps {
  streets: GroundPatch[]
  parks: GroundPatch[]
  crossings: DetailBox[]
  trees: Tree[]
  theme: Theme
}

/**
 * The ground between the blocks: side streets in the avenue's asphalt, lawns of the parks, zebra
 * crossings on the avenue, and the street trees. Five draws for the whole city.
 */
export const CityGround = memo(function CityGround({ streets, parks, crossings, trees, theme }: CityGroundProps) {
  const isLight = theme === 'light'
  const asphalt = useTexture([
    '/textures/Asphalt009_1K-JPG_Color.webp',
    '/textures/Asphalt009_1K-JPG_NormalGL.webp',
    '/textures/Asphalt009_1K-JPG_Roughness.webp',
  ])

  const geometries = useMemo(
    () => ({ streets: patchGeometry(streets, STREET_Y, STREET_TILE), parks: patchGeometry(parks, LAWN_Y, 4) }),
    [streets, parks]
  )
  useEffect(() => () => Object.values(geometries).forEach((g) => g.dispose()), [geometries])
  const crown = useMemo(createCrownGeometry, [])
  const leafTexture = useMemo(createLeafTexture, [])
  useEffect(
    () => () => {
      crown.dispose()
      leafTexture.dispose()
    },
    [crown, leafTexture]
  )

  const materials = useMemo(
    () => ({
      street: Object.assign(new THREE.MeshStandardMaterial({ roughness: 0.9 }), withGroundAO),
      lawn: Object.assign(new THREE.MeshStandardMaterial({ roughness: 1 }), withGroundAO),
      paint: new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: true, opacity: 0.8 }),
      bark: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
      leaves: new THREE.MeshStandardMaterial({
        roughness: 0.8,
        vertexColors: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
      }),
    }),
    []
  )
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials])

  useLayoutEffect(() => {
    materials.street.map = asphalt[0]
    materials.street.normalMap = asphalt[1]
    materials.street.roughnessMap = asphalt[2]
    materials.street.needsUpdate = true
    materials.leaves.map = leafTexture
    materials.leaves.needsUpdate = true
  }, [asphalt, materials, leafTexture])

  useLayoutEffect(() => {
    materials.street.color.set(isLight ? '#e6e6e6' : '#9a9a9a')
    materials.lawn.color.set(isLight ? '#8d9b66' : '#6d7a52')
    materials.paint.color.set(isLight ? '#f2efe8' : '#a9a598')
    materials.bark.color.set(isLight ? '#5b4a3c' : '#3e342c')
    materials.leaves.color.set(isLight ? '#ffffff' : '#b8c2b4')
  }, [isLight, materials])

  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const crownRef = useRef<THREE.InstancedMesh>(null)
  const crossingRef = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const trunks = trunkRef.current
    const crowns = crownRef.current
    if (!trunks || !crowns) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const color = new THREE.Color()
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.tone * Math.PI * 2)
      m.compose(new THREE.Vector3(t.x, 0, t.z), q, new THREE.Vector3(t.crown * 0.8, t.trunk + t.crown * 0.3, t.crown * 0.8))
      trunks.setMatrixAt(i, m)
      m.compose(new THREE.Vector3(t.x, t.trunk + t.crown * 0.75, t.z), q, new THREE.Vector3(t.crown, t.crown * 1.05, t.crown))
      crowns.setMatrixAt(i, m)
      color.set(CROWN_GREENS[Math.floor(t.tone * CROWN_GREENS.length) % CROWN_GREENS.length])
      crowns.setColorAt(i, color)
    })
    for (const mesh of [trunks, crowns]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [trees])

  useLayoutEffect(() => {
    const mesh = crossingRef.current
    if (!mesh) return
    const dummy = new THREE.Object3D()
    crossings.forEach((c, i) => {
      dummy.position.set(...c.pos)
      dummy.rotation.set(0, c.yaw, 0)
      dummy.scale.set(...c.scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [crossings])

  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  useEffect(() => () => box.dispose(), [box])

  return (
    <group>
      <mesh geometry={geometries.streets} material={materials.street} receiveShadow />
      <mesh geometry={geometries.parks} material={materials.lawn} receiveShadow />
      {crossings.length > 0 && (
        <instancedMesh key={`c${crossings.length}`} ref={crossingRef} args={[box, materials.paint, crossings.length]} receiveShadow />
      )}
      {trees.length > 0 && (
        <>
          <instancedMesh key={`t${trees.length}`} ref={trunkRef} args={[TRUNK, materials.bark, trees.length]} castShadow />
          <instancedMesh key={`k${trees.length}`} ref={crownRef} args={[crown, materials.leaves, trees.length]} castShadow receiveShadow />
        </>
      )}
    </group>
  )
})
