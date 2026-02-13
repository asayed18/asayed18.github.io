import { useMemo, useEffect } from 'react'
import * as THREE from 'three'

/** Canvas-drawn text mesh to avoid Troika/WebGL2 gl_FragColor issues. Use for simple labels. */
interface CanvasTextProps {
  children: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  fontSize?: number
  color?: string
  opacity?: number
  anchorX?: 'left' | 'center' | 'right'
  anchorY?: 'top' | 'middle' | 'bottom'
  depthTest?: boolean
  renderOrder?: number
  fontWeight?: string
}

const DEFAULT_FONT = '14px system-ui, sans-serif'

export function CanvasText({
  children,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  fontSize = 0.5,
  color = '#ffffff',
  opacity = 1,
  anchorX = 'center',
  anchorY = 'middle',
  depthTest = true,
  renderOrder = 0,
  fontWeight = 'normal',
}: CanvasTextProps) {
  const { texture, size } = useMemo(() => {
    const text = String(children).trim() || ' '
    const pixelRatio = 2
    const px = Math.max(1, Math.ceil(fontSize * 32 * pixelRatio))
    const font = `${fontWeight} ${px}px ${DEFAULT_FONT}`
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return { texture: new THREE.CanvasTexture(canvas), size: [1, 1] as [number, number] }

    ctx.font = font
    const metrics = ctx.measureText(text)
    const w = Math.ceil(Math.max(metrics.width, 1) + 4)
    const h = Math.ceil(px * 1.4)
    canvas.width = w
    canvas.height = h
    ctx.font = font
    ctx.fillStyle = color
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    ctx.fillText(text, w / 2, h / 2)

    const tex = new THREE.CanvasTexture(canvas)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.needsUpdate = true
    const aspect = w / h
    const hNorm = 1
    const wNorm = aspect
    return { texture: tex, size: [wNorm, hNorm] as [number, number] }
  }, [children, fontSize, color, fontWeight])

  useEffect(() => () => texture.dispose(), [texture])

  const [w, h] = size
  const offsetX = anchorX === 'left' ? w / 2 : anchorX === 'right' ? -w / 2 : 0
  const offsetY = anchorY === 'top' ? -h / 2 : anchorY === 'bottom' ? h / 2 : 0

  return (
    <mesh
      position={[
        position[0] + offsetX * scale[0],
        position[1] + offsetY * scale[1],
        position[2],
      ]}
      rotation={rotation}
      scale={scale}
      renderOrder={renderOrder}
    >
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={opacity}
        depthTest={depthTest}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}
