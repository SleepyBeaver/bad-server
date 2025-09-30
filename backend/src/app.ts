import { errors as celebrateErrors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded, type RequestHandler } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import helmet from 'helmet'
import hpp from 'hpp'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import compression from 'compression'
import csrf from 'csurf'

import { DB_ADDRESS, CORS_ORIGINS, PORT, NODE_ENV } from './config'
import errorHandler from './middlewares/error-handler'

import routes from './routes'

const app = express()

const isProd = NODE_ENV === 'production'
const DEFAULT_ORIGIN = 'http://localhost:5173'

const allow = new Set(
  (CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)
if (!allow.has(DEFAULT_ORIGIN)) allow.add(DEFAULT_ORIGIN)

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allow.has(origin)) return cb(null, true)
      return cb(new Error('CORS'))
    },
    credentials: true,
  })
)

app.use((req, res, next) => {
  const o = (req.headers.origin as string | undefined) || DEFAULT_ORIGIN
  if (allow.has(o) && !res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', o)
  }
  res.setHeader('Vary', 'Origin')
  next()
})

app.disable('x-powered-by')
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false,
  })
)
app.use(hpp())
app.use(compression())
app.set('trust proxy', 1)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests' },
  skip: (req) => {
    if (req.method === 'HEAD') return true
    if (req.path === '/health' || req.path === '/api/health') return true
    return false
  },
})
app.use(limiter)

app.use(mongoSanitize())
app.use(cookieParser())
app.use(urlencoded({ extended: false }))
app.use(json({ limit: '1mb' }))

const csrfProtection: RequestHandler = csrf({
  cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' },
}) as unknown as RequestHandler

app.use((req, res, next) => {
  const exemptPaths = ['/auth/login', '/auth/register', '/csrf-token', '/api/csrf-token']
  if (exemptPaths.includes(req.path)) return next()
  return csrfProtection(req, res, next)
})

app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: (req as any).csrfToken() })
})
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: (req as any).csrfToken() })
})

app.use('/public', express.static(path.join(__dirname, 'public')))

app.use(routes)

app.use(celebrateErrors())
app.use(errorHandler)

app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).json({ error: 'Неверный CSRF токен' })
  }
  next(err)
})

app.use((_req, res) => {
  if (res.headersSent) return
  res.status(404).json({ message: 'Not found' })
})

const bootstrap = async () => {
  try {
    await mongoose.connect(DB_ADDRESS)
    await app.listen(Number(PORT) || 3000, () =>
      console.log(`Server listening on port ${PORT}`)
    )
  } catch (error) {
    console.error(error)
  }
}

bootstrap()

export default app