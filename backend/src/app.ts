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
import { Request, Response, NextFunction } from 'express'

import { DB_ADDRESS, CORS_ORIGINS, PORT, NODE_ENV } from './config'
import errorHandler from './middlewares/error-handler'
import routes from './routes'

const app = express()
const isProd = NODE_ENV === 'production'
const isTest = NODE_ENV === 'test' || NODE_ENV === 'development'
const DEFAULT_ORIGIN = 'http://localhost:5173'

const allow = new Set(
  (CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
)
allow.add(DEFAULT_ORIGIN)

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allow.has(origin)) return cb(null, true)
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
  max: isTest ? 1000 : 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests' },
  skip: (req) => req.method === 'HEAD' || ['/health', '/api/health'].includes(req.path),
})
app.use(limiter)

app.use(mongoSanitize())
app.use(cookieParser())
app.use(urlencoded({ extended: false }))
app.use(json({ limit: '1mb' }))

const csrfProtection: RequestHandler = isTest
  ? ((_req: Request, _res: Response, next: NextFunction) => next())
  : csrf({
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/' },
    }) as unknown as RequestHandler

app.get('/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: (req as any).csrfToken?.() || 'test-token' })
})
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: (req as any).csrfToken?.() || 'test-token' })
})

app.use('/public', express.static(path.join(__dirname, 'public')))
app.use(routes)

app.use(celebrateErrors())
app.use(errorHandler)
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
