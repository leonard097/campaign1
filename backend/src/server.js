import app from './app.js'
import { ensureStorageStructure } from './services/storageService.js'

const PORT = Number(process.env.PORT) || 3001

async function startServer() {
  await ensureStorageStructure()

  app.listen(PORT, () => {
    console.log(`Mythic Chronicle backend listening on http://localhost:${PORT}`)
  })
}

startServer().catch((error) => {
  console.error('Unable to initialize local storage.', error)
  process.exit(1)
})
