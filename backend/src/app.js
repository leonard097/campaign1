import express from 'express'
import apiRouter from './routes/api.js'

const app = express()

app.use(express.json())
app.use('/api', apiRouter)

app.use((_req, res) => {
  res.status(404).json({
    message: 'Route not found.',
  })
})

app.use((error, _req, res, _next) => {
  console.error(error)

  res.status(500).json({
    message: 'Unable to process the Mythic Chronicle request.',
  })
})

export default app
