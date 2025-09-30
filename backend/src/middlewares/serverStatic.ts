import { NextFunction, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'

export default function serveStatic(baseDir: string) {
  const root = path.resolve(baseDir)

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestedPath = decodeURIComponent((req.path || '').split('?')[0] || '')
      const filePath = path.resolve(path.join(root, requestedPath))

      if (!filePath.startsWith(root)) {
        return res.status(403).send({ message: 'Forbidden' })
      }

      fs.stat(filePath, (err, stat) => {
        if (err) return next()

        if (stat.isDirectory()) {
          const indexFile = path.join(filePath, 'index.html')
          if (!indexFile.startsWith(root)) return res.status(403).send({ message: 'Forbidden' })

          fs.stat(indexFile, (indexErr) => {
            if (indexErr) return res.status(404).send({ message: 'Not found' })
            return res.sendFile(indexFile, { dotfiles: 'deny' })
          })
        } else {
          return res.sendFile(filePath, { dotfiles: 'deny' })
        }
      })
    } catch (e) {
      return next(e)
    }
  }
}
