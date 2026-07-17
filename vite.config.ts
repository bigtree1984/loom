import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

// Dev-only endpoint so the app can auto-load whatever JSON was most recently
// written to samples/ (e.g. by Claude), instead of requiring a manual upload
// click every time.
function samplesAutoloadPlugin(): Plugin {
  const samplesDir = path.resolve(dirname, 'samples')

  return {
    name: 'loom-samples-autoload',
    configureServer(server) {
      server.middlewares.use('/api/latest-sample', (_req, res) => {
        const files = fs.existsSync(samplesDir)
          ? fs.readdirSync(samplesDir).filter((f) => f.endsWith('.json'))
          : []
        if (files.length === 0) {
          res.statusCode = 404
          res.end('{}')
          return
        }
        const latest = files
          .map((file) => ({ file, mtimeMs: fs.statSync(path.join(samplesDir, file)).mtimeMs }))
          .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
        const content = fs.readFileSync(path.join(samplesDir, latest.file), 'utf-8')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ filename: latest.file, mtimeMs: latest.mtimeMs, content: JSON.parse(content) }))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), samplesAutoloadPlugin()],
})
