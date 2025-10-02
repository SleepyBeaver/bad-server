import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import BadRequestError from '../errors/bad-request-error'

export const uploadFile = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new BadRequestError('Файл не загружен'))
    }

    if (req.file.size < 2 * 1024) {
        return next(
            new BadRequestError('Файл слишком маленький (минимум 2 КБ)')
        )
    }

    if (req.file.size > 10 * 1024 * 1024) {
        return next(
            new BadRequestError('Файл слишком большой (максимус 10 МБ)')
        )
    }

    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(req.file.mimetype)) {
        return next(new BadRequestError('Недопустимый тип файла'))
    }

    try {
        const extension = path.extname(req.file.originalname)
        const uniqueFileName = `${randomUUID()}${extension}`

        if (!['.png', '.jpg', '.jpeg'].includes(extension.toLowerCase())) {
            return next(new BadRequestError('Недопустимый тип файла'))
        }

        let validSignature = false

        if (!req.file.path){
            return next(new BadRequestError('Ошибка загрузки файла'))
        }

        const fileBuffer = fs.readFileSync(req.file.path)
        const signature = fileBuffer.slice(0, 4).toString('hex')

        switch (req.file.mimetype) {
            case 'image/png':
                validSignature = signature === '89504e47'
                break
            case 'image/jpeg':
                validSignature =
                    signature === 'ffd8ffe0' || signature === 'ffd8ffe1'
                break
            default:
                return next(new BadRequestError('Неизвестный тип файла'))
        }

        if (!validSignature) {
            return next(new BadRequestError('Неверный формат изображения'))
        }

        const fileName = process.env.UPLOAD_PATH
            ? `/${process.env.UPLOAD_PATH}/${req.file.filename} `
            : `/${uniqueFileName}`

        return res.status(constants.HTTP_STATUS_CREATED).send({
            fileName,
            originalName: req.file?.originalname,
        })
    } catch (error) {
        return next(error)
    }
}

export default {}