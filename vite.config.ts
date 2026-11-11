import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build, defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** What src/prerender.tsx exports. */
interface Prerender {
  siteUrl: string
  renderStaticShell(): string
  structuredData(): Record<string, unknown>
}

const PRERENDER_ENTRY = 'src/prerender.tsx'
/** The lazily loaded 3D chunk (see src/Journey.tsx). */
const SCENE_MODULE = '/src/three/Experience3D.tsx'
const ROOT_PLACEHOLDER = '<div id="root"></div>'

/**
 * Compiles src/prerender.tsx for Node and imports it. A small build of its own, so the app's
 * components and data are used as they are without the dev server depending on them.
 */
async function loadPrerender(root: string): Promise<Prerender> {
  const result = await build({
    root,
    configFile: false,
    logLevel: 'warn',
    publicDir: false,
    plugins: [react()],
    build: { ssr: PRERENDER_ENTRY, write: false, minify: false },
  })
  const [bundle] = Array.isArray(result) ? result : [result]
  if (!('output' in bundle)) throw new Error('Prerender build returned no output')
  const entry = bundle.output.find((item) => item.type === 'chunk' && item.isEntry)
  if (!entry || entry.type !== 'chunk') throw new Error(`Prerender build has no entry chunk for ${PRERENDER_ENTRY}`)

  // Written inside node_modules so its imports of react resolve like the app's.
  const dir = path.join(root, 'node_modules', '.prerender')
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, 'prerender.mjs')
  await writeFile(file, entry.code)
  return import(`${pathToFileURL(file).href}?t=${Date.now()}`) as Promise<Prerender>
}

/**
 * Production builds only. Makes index.html a complete page:
 *
 * - `<div id="root">` is filled with the landing screen and the text version of the site.
 * - The JSON-LD structured data is generated from the same data the page shows.
 * - The 3D chunk is preloaded, so it downloads alongside the main script instead of after it.
 * - sitemap.xml is written with the date of the build.
 */
function staticShell(): Plugin {
  let root = process.cwd()
  let prerender: Promise<Prerender> | undefined
  const load = () => (prerender ??= loadPrerender(root))

  return {
    name: 'static-shell',
    apply: 'build',

    configResolved(config) {
      root = config.root
    },

    async generateBundle() {
      const { siteUrl } = await load()
      const today = new Date().toISOString().slice(0, 10)
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source:
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          `  <url>\n    <loc>${siteUrl}</loc>\n    <lastmod>${today}</lastmod>\n  </url>\n` +
          '</urlset>\n',
      })
    },

    transformIndexHtml: {
      order: 'post',
      async handler(html, ctx) {
        const page = await load()
        if (!html.includes(ROOT_PLACEHOLDER)) {
          throw new Error(`index.html must contain ${ROOT_PLACEHOLDER} for the static shell`)
        }

        // The scene chunk and the chunks only it needs.
        const chunks = Object.values(ctx.bundle ?? {}).filter((item) => item.type === 'chunk')
        const entry = chunks.find((chunk) => chunk.isEntry)
        const scene = chunks.find((chunk) => chunk.facadeModuleId?.endsWith(SCENE_MODULE))
        const preloads = scene
          ? [scene.fileName, ...scene.imports].filter(
              (file) => file !== entry?.fileName && !entry?.imports.includes(file)
            )
          : []

        return {
          html: html.replace(ROOT_PLACEHOLDER, `<div id="root">${page.renderStaticShell()}</div>`),
          tags: [
            {
              tag: 'script',
              attrs: { type: 'application/ld+json' },
              // "<" is escaped so no text in the data can close the script element.
              children: JSON.stringify(page.structuredData()).replace(/</g, '\\u003c'),
              injectTo: 'head',
            },
            ...preloads.map((file) => ({
              tag: 'link',
              attrs: { rel: 'modulepreload', crossorigin: true, href: `/${file}` },
              injectTo: 'head' as const,
            })),
          ],
        }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), staticShell()],
  base: '/',
})
