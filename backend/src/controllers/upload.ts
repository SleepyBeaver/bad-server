import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import path from 'node:path'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import BadRequestError from '../errors/bad-request-error'

const UPLOAD_DIR = process.env.UPLOAD_PATH || 'uploads'

export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.file) {
    return next(new BadRequestError('Файл не загружен'))
  }

  try {
    const ext = path.extname(req.file.originalname)
    const uniqueName = crypto.randomBytes(16).toString('hex') + ext

    const uploadPath = path.join(process.cwd(), UPLOAD_DIR)
    const filePath = path.join(uploadPath, uniqueName)

    await fs.mkdir(uploadPath, { recursive: true })

    // Сохраняем файл
    await fs.writeFile(filePath, req.file.buffer)

    return res.status(constants.HTTP_STATUS_CREATED).send({
      fileName: `/${UPLOAD_DIR}/${uniqueName}`,
      originalName: req.file.originalname,
    })
  } catch (error) {
    return next(error)
  }
}

export default {}
