import xss from 'xss'
import { Request, Response, NextFunction } from 'express'

const sanitizeValue = (val: any): any => {
  if (typeof val === 'string') {
    return xss(val)
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue)
  }
  if (val && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val).map(([key, value]) => [key, sanitizeValue(value)])
    )
  }
  return val
}

export const sanitizeBody = (fields: string[]) => (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  fields.forEach((field) => {
    if (req.body[field] !== undefined) {
      req.body[field] = sanitizeValue(req.body[field])
    }
  })
  next()
}
