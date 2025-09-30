import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import path from 'path'
import mongoose from 'mongoose'
import csurf from 'csurf'
import { errors } from 'celebrate'
import { DB_ADDRESS, PORT } from './config'
import routes from './routes'
import errorHandler from './middlewares/error-handler'

const app = express()

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

app.use(cookieParser())

app.use(
  cors({
    origin: 'http://localhost:5173',
    credentials: true,
  })
)

app.use(json({ limit: '1mb' }))
app.use(urlencoded({ extended: true }))
app.use(mongoSanitize())

const csrfProtection = csurf({ cookie: { httpOnly: true, sameSite: 'lax' } })
app.use((req, res, next) => {
    const exemptPaths = ['/auth/login', '/auth/register', '/csrf-token']
    if (exemptPaths.includes(req.path)) return next()
    return csrfProtection(req, res, next)
})

app.get('/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() })
})

const appLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
})
app.use(appLimiter)

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
})
app.use('/auth/login', loginLimiter)

app.use(
  '/public',
  cors({ origin: 'http://localhost:5173', credentials: true }),
  express.static(path.join(__dirname, 'public'))
)

app.get('/', (_req, res) => {
  res.json({ message: 'API работает' })
})

app.use(routes)
app.use(errors())
app.use(errorHandler)

app.use(
  (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).json({ error: 'Неверный CSRF токен' })
    }
    next(err)
  }
)

const bootstrap = async () => {
  try {
    await mongoose.connect(DB_ADDRESS)
    await app.listen(PORT, () => console.log(`Server listening on port ${PORT}`))
  } catch (error) {
    console.error(error)
  }
}

bootstrap()