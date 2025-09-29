import type { Request } from 'express'
import multer, { FileFilterCallback } from 'multer'
import { resolve } from 'path'
import fs from 'fs'
import crypto from 'crypto'
import sanitizeFilename from 'sanitize-filename'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

const UPLOAD_SUBDIR = process.env.UPLOAD_PATH_TEMP || 'uploads'
const BASE_UPLOAD_DIR = resolve(__dirname, '..', 'public', UPLOAD_SUBDIR)

fs.mkdirSync(BASE_UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb: DestinationCallback) => {
    cb(null, BASE_UPLOAD_DIR)
  },
  filename: (_req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
    const safeBase = sanitizeFilename(file.originalname) || 'file'
    const ext = safeBase.includes('.') ? `.${safeBase.split('.').pop()}` : ''
    const name = `${crypto.randomUUID()}${ext}`
    cb(null, name)
  },
})

const types = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml']

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (!types.includes(file.mimetype)) {
    return cb(null, false)
  }
  return cb(null, true)
}

export default multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
})
