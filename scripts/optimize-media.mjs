// Regenerates the images and clips under public/ that are derived from the originals in
// assets-src/ (and from public/avatar.png). Run it after adding or replacing an original:
//
//   npm run media
//
// Images are converted with sharp. The portfolio clips need ffmpeg on the PATH.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = (...parts) => path.join(root, 'assets-src', ...parts)
const published = (...parts) => path.join(root, 'public', ...parts)

/**
 * Scene textures: [original, output, width in pixels].
 *
 * The road is seen from close by, so it keeps its 1K maps. The walls repeat their texture 20
 * times per face: one tile never covers more than about 64 screen pixels, so 256px is plenty.
 * The moon is about 100 pixels wide on screen.
 */
const TEXTURES = [
  ['Asphalt009_1K-JPG_Color.jpg', 'Asphalt009_1K-JPG_Color.webp', 1024],
  ['Asphalt009_1K-JPG_NormalGL.jpg', 'Asphalt009_1K-JPG_NormalGL.webp', 1024],
  ['Asphalt009_1K-JPG_Roughness.jpg', 'Asphalt009_1K-JPG_Roughness.webp', 1024],
  ['moon.png', 'moon.webp', 512],
]

/** Portfolio cards are at most 510 CSS pixels wide: 1024 covers a 2x screen. */
const CARD_WIDTH = 1024
/** Stills that become a WebP thumbnail. */
const PORTFOLIO_STILLS = ['huawei.png', 'amazon.png']
/** Screen recordings that become an H.264 clip plus a poster of its first frame. */
const PORTFOLIO_CLIPS = ['link-datacenter.gif', 'seedstars.gif', 'seedspace.gif', 'babbel.gif', 'vyoo.gif']

const report = (file) => {
  const kb = (fs.statSync(file).size / 1024).toFixed(0)
  console.log(`  ${path.relative(root, file)}  ${kb} kB`)
}

async function textures() {
  console.log('Textures')
  for (const [original, output, width] of TEXTURES) {
    const target = published('textures', output)
    await sharp(source('textures', original))
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80, effort: 6 })
      .toFile(target)
    report(target)
  }
}

async function avatar() {
  console.log('Avatar and icons')
  // The page shows the avatar in a circle that crops the centre square of the photo.
  const square = (size) => sharp(published('avatar.png')).resize(size, size, { fit: 'cover', position: 'centre' })
  const outputs = [
    [published('avatar-320.webp'), square(320).webp({ quality: 82, effort: 6 })],
    [published('favicon.png'), square(64).png({ compressionLevel: 9, palette: true })],
    [published('apple-touch-icon.png'), square(180).png({ compressionLevel: 9 })],
  ]
  for (const [target, image] of outputs) {
    await image.toFile(target)
    report(target)
  }
}

async function portfolioStills() {
  console.log('Portfolio stills')
  for (const still of PORTFOLIO_STILLS) {
    const target = published('portfolio', `${path.parse(still).name}.webp`)
    await sharp(source('portfolio', still))
      .resize({ width: CARD_WIDTH, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6 })
      .toFile(target)
    report(target)
  }
}

/** Runs ffmpeg and returns what it wrote to standard output. */
function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error?.code === 'ENOENT') {
    throw new Error('ffmpeg was not found. Install it (for example "brew install ffmpeg") and run this again.')
  }
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`)
  return result.stdout
}

async function portfolioClips() {
  console.log('Portfolio clips')
  for (const clip of PORTFOLIO_CLIPS) {
    const name = path.parse(clip).name
    const video = published('portfolio', `${name}.mp4`)
    const poster = published('portfolio', `${name}.webp`)
    // H.264 plays everywhere. Even dimensions and yuv420p are required by most decoders;
    // faststart lets playback begin before the file has fully downloaded.
    ffmpeg([
      '-i', source('portfolio', clip),
      '-vf', `scale='min(${CARD_WIDTH},iw)':-2:flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', '-an',
      video,
    ])
    // The poster is the clip's own first frame, so starting playback does not change the picture.
    const firstFrame = ffmpeg(['-i', video, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'])
    await sharp(firstFrame).webp({ quality: 82, effort: 6 }).toFile(poster)
    report(video)
    report(poster)
  }
}

await textures()
await avatar()
await portfolioStills()
await portfolioClips()
