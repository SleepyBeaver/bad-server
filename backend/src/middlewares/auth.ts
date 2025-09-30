import { NextFunction, Request, Response } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Types } from 'mongoose'
import { ACCESS_TOKEN, REFRESH_TOKEN } from '../config'
import ForbiddenError from '../errors/forbidden-error'
import UnauthorizedError from '../errors/unauthorized-error'
import NotFoundError from '../errors/not-found-error'
import UserModel, { Role } from '../models/user'

function pickAccessToken(req: Request): string {
  const header = req.headers.authorization || ''
  const [scheme, bearer] = header.split(' ')
  if (scheme?.toLowerCase() === 'bearer' && bearer) {
    return bearer
  }

  const cookieToken = (req as any).cookies?.accessToken
  if (typeof cookieToken === 'string' && cookieToken) {
    return cookieToken
  }

  return ''
}

const auth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const access = pickAccessToken(req)

    if (access) {
      try {
        const payload = jwt.verify(access, ACCESS_TOKEN.secret) as JwtPayload
        const userId = payload.sub || payload._id || payload.id
        if (!userId) {
          return next(new UnauthorizedError('Необходима авторизация'))
        }

        const user = await UserModel.findById(new Types.ObjectId(userId), {
          password: 0,
          salt: 0,
        })

        if (!user) {
          return next(new ForbiddenError('Нет доступа'))
        }

        res.locals.user = user
        return next()
      } catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError') {
          return next(new UnauthorizedError('Истек срок действия токена'))
        }
        return next(new UnauthorizedError('Необходима авторизация'))
      }
    }

    const rt = (req as any).cookies?.[REFRESH_TOKEN.cookie.name]
    if (typeof rt === 'string' && rt) {
      try {
        const payload = jwt.verify(rt, REFRESH_TOKEN.secret) as JwtPayload
        const userId = payload.sub || payload._id || payload.id
        if (!userId) {
          return next(new UnauthorizedError('Необходима авторизация'))
        }

        const user = await UserModel.findById(new Types.ObjectId(userId), {
          password: 0,
          salt: 0,
        })

        if (!user) {
          return next(new ForbiddenError('Нет доступа'))
        }

        res.locals.user = user
        return next()
      } catch {
        return next(new UnauthorizedError('Необходима авторизация'))
      }
    }

    return next(new UnauthorizedError('Необходима авторизация'))
  } catch {
    return next(new UnauthorizedError('Необходима авторизация'))
  }
}

export function roleGuardMiddleware(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'))
    }

    const hasAccess = roles.some((role) =>
      res.locals.user.roles.includes(role)
    )

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'))
    }

    return next()
  }
}

export function currentUserAccessMiddleware<T>(
  model: any,
  idProperty: string,
  userProperty: keyof T
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const id = req.params[idProperty]

    if (!res.locals.user) {
      return next(new UnauthorizedError('Необходима авторизация'))
    }

    if (res.locals.user.roles.includes(Role.Admin)) {
      return next()
    }

    const entity = await model.findById(id)
    if (!entity) {
      return next(new NotFoundError('Не найдено'))
    }

    const userEntityId = entity[userProperty] as Types.ObjectId
    const hasAccess = new Types.ObjectId(res.locals.user.id).equals(
      userEntityId
    )

    if (!hasAccess) {
      return next(new ForbiddenError('Доступ запрещен'))
    }

    return next()
  }
}

export default auth
