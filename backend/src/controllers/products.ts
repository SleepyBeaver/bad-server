import { NextFunction, Request, Response } from 'express'
import { constants } from 'http2'
import { Error as MongooseError, isValidObjectId } from 'mongoose'
import { join } from 'path'
import BadRequestError from '../errors/bad-request-error'
import ConflictError from '../errors/conflict-error'
import NotFoundError from '../errors/not-found-error'
import Product from '../models/product'
import movingFile from '../utils/movingFile'

// GET /product
const getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page = 1, limit = 5 } = req.query
        const options = {
            skip: (Number(page) - 1) * Number(limit),
            limit: Number(limit),
        }
        const products = await Product.find({}, null, options)
        const totalProducts = await Product.countDocuments({})
        const totalPages = Math.ceil(totalProducts / Number(limit))
        return res.send({
            items: products,
            pagination: {
                totalProducts,
                totalPages,
                currentPage: Number(page),
                pageSize: Number(limit),
            },
        })
    } catch (err) {
        return next(err)
    }
}

// POST /product
const createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { description, category, price, title, image } = req.body

        if (typeof title !== 'string' || title.length < 2 || title.length > 30)
            return next(new BadRequestError('Поле "title" должно быть строкой от 2 до 30 символов'))

        if (image) {
            movingFile(
                image.fileName,
                join(__dirname, `../public/${process.env.UPLOAD_PATH_TEMP}`),
                join(__dirname, `../public/${process.env.UPLOAD_PATH}`)
            )
        }

        const product = await Product.create({ description, image, category, price, title })
        return res.status(constants.HTTP_STATUS_CREATED).send(product)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
        if (error instanceof Error && error.message.includes('E11000'))
            return next(new ConflictError('Товар с таким заголовком уже существует'))
        return next(error)
    }
}

// PUT /product
const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params
        if (!isValidObjectId(productId)) return next(new BadRequestError('Передан не валидный ID товара'))

        const allowedFields = ['title', 'description', 'category', 'price', 'image']
        const updateData: any = {}
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field]
        })

        if (updateData.image) {
            movingFile(
                updateData.image.fileName,
                join(__dirname, `../public/${process.env.UPLOAD_PATH_TEMP}`),
                join(__dirname, `../public/${process.env.UPLOAD_PATH}`)
            )
        }

        const product = await Product.findByIdAndUpdate(productId, updateData, { new: true, runValidators: true })
            .orFail(() => new NotFoundError('Нет товара по заданному id'))

        return res.send(product)
    } catch (error) {
        if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
        if (error instanceof Error && error.message.includes('E11000'))
            return next(new ConflictError('Товар с таким заголовком уже существует'))
        return next(error)
    }
}

// DELETE /product
const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productId } = req.params
        if (!isValidObjectId(productId)) return next(new BadRequestError('Передан не валидный ID товара'))

        const product = await Product.findByIdAndDelete(productId).orFail(
            () => new NotFoundError('Нет товара по заданному id')
        )
        return res.send(product)
    } catch (error) {
        return next(error)
    }
}

export { createProduct, deleteProduct, getProducts, updateProduct }
