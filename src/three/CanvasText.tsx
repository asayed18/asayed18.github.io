import { useMemo, useEffect } from 'react'
import * as THREE from 'three'

/** Texture pixels per layout pixel. Keeps the labels sharp when the camera is close. */
const SUPERSAMPLE = 4

/**
 * Draws white text on black and returns it as an alpha mask. The colour comes from the material,
 * so filtering and mip-mapping never blend the glyph edges with the transparent background.
 * Mip-mapped so a distant label does not shimmer while the camera moves.
 */
function drawTextMask(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  width: number,
  height: number
): THREE.CanvasTexture {
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, width, height)
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(text, width / 2, height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.generateMipmaps = true
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.needsUpdate = true
  return texture
}

interface CanvasTextProps {
  children: string
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: [number, number, number]
  /** Sets the height of the canvas around the text. See the note on the component. */
  fontSize?: number
  color?: string
  opacity?: number
  anchorX?: 'left' | 'center' | 'right'
  anchorY?: 'top' | 'middle' | 'bottom'
  depthTest?: boolean
  renderOrder?: number
}

/**
 * Canvas-drawn text on a plane that is always one world unit tall. Used for the year labels on
 * the experience buildings.
 *
 * The glyphs are drawn with the canvas default font (10px sans-serif) and `fontSize` only sets
 * how tall the canvas around them is, so a larger value gives smaller text. The labels were tuned
 * against this behaviour, so it is kept as it is. Use GroundText where the text size matters.
 */
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
}: CanvasTextProps) {
  const { texture, size } = useMemo(() => {
    const text = String(children).trim() || ' '
    const font = '10px sans-serif'
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return { texture: new THREE.CanvasTexture(canvas), size: [1, 1] as [number, number] }

    ctx.font = font
    const metrics = ctx.measureText(text)
    const w = Math.ceil(Math.max(metrics.width, 1) + 4)
    const h = Math.ceil(Math.max(1, Math.ceil(fontSize * 64)) * 1.4)
    canvas.width = w * SUPERSAMPLE
    canvas.height = h * SUPERSAMPLE
    ctx.scale(SUPERSAMPLE, SUPERSAMPLE)

    return { texture: drawTextMask(canvas, ctx, text, font, w, h), size: [w / h, 1] as [number, number] }
  }, [children, fontSize])

  useEffect(() => () => texture.dispose(), [texture])

  // The labels were tuned with their hex values read as linear light, which shows them brighter
  // than the same hex in CSS. Keep that.
  const linearColor = useMemo(() => new THREE.Color().setStyle(color, THREE.LinearSRGBColorSpace), [color])

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
        color={linearColor}
        alphaMap={texture}
        transparent
        opacity={opacity}
        depthTest={depthTest}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

interface GroundTextProps {
  children: string
  /** Height of one em in world units. */
  fontSize: number
  color: string
  position?: [number, number, number]
  rotation?: [number, number, number]
}

const GROUND_TEXT_EM_PX = 160
const GROUND_TEXT_LINE_HEIGHT = 1.4

/**
 * Centered text with a real world-space size, drawn with the same system font as the page UI.
 * Used for the dates painted on the road.
 */
export function GroundText({
  children,
  fontSize,
  color,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}: GroundTextProps) {
  const { texture, width, height } = useMemo(() => {
    const text = String(children).trim() || ' '
    const font = `${GROUND_TEXT_EM_PX}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const unit = fontSize / GROUND_TEXT_EM_PX
    if (!ctx) return { texture: new THREE.CanvasTexture(canvas), width: fontSize, height: fontSize }

    ctx.font = font
    const w = Math.ceil(ctx.measureText(text).width + GROUND_TEXT_EM_PX * 0.2)
    const h = Math.ceil(GROUND_TEXT_EM_PX * GROUND_TEXT_LINE_HEIGHT)
    canvas.width = w
    canvas.height = h

    return { texture: drawTextMask(canvas, ctx, text, font, w, h), width: w * unit, height: h * unit }
  }, [children, fontSize])

  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color={color} alphaMap={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}
