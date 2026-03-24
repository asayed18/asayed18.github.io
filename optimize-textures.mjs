import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const texturesDir = path.join(__dirname, 'public', 'textures')

async function optimizeTextures() {
  const files = fs.readdirSync(texturesDir)
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.png')) {
      const filePath = path.join(texturesDir, file)
      const parsedPath = path.parse(filePath)
      const webpPath = path.join(texturesDir, `${parsedPath.name}.webp`)
      
      console.log(`Optimizing ${file}...`)
      await sharp(filePath)
        .webp({ quality: 80, effort: 6 })
        .toFile(webpPath)
      
      console.log(`Created ${path.basename(webpPath)}`)
    }
  }
}

optimizeTextures().catch(console.error)
