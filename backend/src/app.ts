import { errors } from 'celebrate';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import 'dotenv/config';
import express, { json, urlencoded, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import csurf from 'csurf';

import { DB_ADDRESS } from './config';
import errorHandler from './middlewares/error-handler';
import routes from './routes';

const { PORT = 3000 } = process.env;
const app = express();

app.use(cookieParser());

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "http://localhost:5173", "data:"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  })
);

const allowedOrigins = ['http://localhost:5173', 'http://localhost:3000']

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true)
            } else {
                callback(new Error(`Not allowed by CORS: ${origin}`))
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    })
)

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Слишком много запросов, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use(urlencoded({ extended: true, limit: '100kb' }));
app.use(json({ limit: '100kb' }));

const csrfProtection = csurf({
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});

if (process.env.NODE_ENV !== 'test') {
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      ['POST', 'PATCH', 'DELETE'].includes(req.method) &&
      !['/auth/login', '/auth/register'].includes(req.path)
    ) {
      csrfProtection(req, res, next);
    } else {
      next();
    }
  });

  app.get('/auth/csrf-token', csrfProtection, (req: Request, res: Response) => {
    res.json({ csrfToken: (req as any).csrfToken() });
  });
} else {
  app.get('/auth/csrf-token', (_req: Request, res: Response) => {
    res.json({ csrfToken: 'test-csrf-token' });
  });
}

app.use(routes);

app.use(errors());

app.use(errorHandler);

const bootstrap = async () => {
  try {
    await mongoose.connect(DB_ADDRESS);
    await app.listen(PORT, () => console.log('Server started on port', PORT));
  } catch (error) {
    console.error(error);
  }
};

bootstrap();