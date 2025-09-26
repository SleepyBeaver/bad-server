import sanitizeHtml from 'sanitize-html'
import { Request, Response, NextFunction } from 'express'

export const sanitizeBody = (fields: string[]) => (req: Request, _res: Response, next: NextFunction) => {
  fields.forEach((field) => {
    const val = req.body[field]
    if (typeof val === 'string' && val.trim() !== '') {
      req.body[field] = sanitizeHtml(val, {
        allowedTags: [],
        allowedAttributes: {},
      })
    } else if (Array.isArray(val)) {
      req.body[field] = val.map((v) => (typeof v === 'string' ? sanitizeHtml(v, { allowedTags: [], allowedAttributes: {} }) : v))
    }
  })
  next()
}
