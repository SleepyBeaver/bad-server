import { errors } from 'celebrate'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import 'dotenv/config'
import express, { json, urlencoded } from 'express'
import mongoose from 'mongoose'
import path from 'path'
import { DB_ADDRESS, ORIGIN_ALLOW } from './config'
import errorHandler from './middlewares/error-handler'
import routes from './routes'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

const { PORT = 3000 } = process.env
const app = express()

app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));

app.use(cookieParser())

app.use(cors({ 
    origin: ORIGIN_ALLOW, 
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Слишком много запросов, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method !== 'GET',
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use(urlencoded({ extended: true }))
app.use(json())

app.options('*', cors())
app.use(routes)
app.use(errors())
app.use(errorHandler)

// eslint-disable-next-line no-console

const bootstrap = async () => {
    try {
        await mongoose.connect(DB_ADDRESS)
        await app.listen(PORT, () => console.log('ok'))
    } catch (error) {
        console.error(error)
    }
}

bootstrap()