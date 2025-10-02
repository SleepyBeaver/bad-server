import { Request, Express } from 'express'
import multer, { FileFilterCallback } from 'multer'
import { join, extname } from 'path'
import crypto from 'crypto'

type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

const storage = multer.diskStorage({
    destination: (_req: Request, _file: Express.Multer.File, cb: DestinationCallback) => {
        cb(
            null,
            join(
                __dirname,
                process.env.UPLOAD_PATH_TEMP ? `../public/${process.env.UPLOAD_PATH_TEMP}` : '../public'
            )
        )
    },
    filename: (_req: Request, file: Express.Multer.File, cb: FileNameCallback) => {
        const rnd = crypto.randomBytes(8).toString('hex')
        cb(null, `${Date.now()}-${rnd}${extname(file.originalname)}`)
    },
})

const types = ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/svg+xml']

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (!types.includes(file.mimetype)) return cb(null, false)
    return cb(null, true)
}

export default multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })
