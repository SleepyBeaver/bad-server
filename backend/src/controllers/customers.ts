import { NextFunction, Request, Response } from 'express'
import { FilterQuery, isValidObjectId } from 'mongoose'
import NotFoundError from '../errors/not-found-error'
import User, { IUser } from '../models/user'
import Order from '../models/order'
import escapeRegExp from '../utils/escapeRegExp'

// GET /customers
export const getCustomers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { page = 1, limit = 10, sortField = 'createdAt', sortOrder = 'desc', search } = req.query

        const filters: FilterQuery<Partial<IUser>> = {}

        if (search && typeof search === 'string') {
            const searchRegex = new RegExp(escapeRegExp(search.slice(0, 100)), 'i')
            const orders = await Order.find({ deliveryAddress: searchRegex }, '_id')
            const orderIds = orders.map((order) => order._id)
            filters.$or = [{ name: searchRegex }, { lastOrder: { $in: orderIds } }]
        }

        const sort: Record<string, any> = {}
        if (sortField && sortOrder) sort[sortField as string] = sortOrder === 'desc' ? -1 : 1

        const options = { sort, skip: (Number(page) - 1) * Number(limit), limit: Number(limit) }

        const users = await User.find(filters, null, options).populate([
            'orders',
            { path: 'lastOrder', populate: { path: 'products' } },
            { path: 'lastOrder', populate: { path: 'customer' } },
        ])

        const totalUsers = await User.countDocuments(filters)
        const totalPages = Math.ceil(totalUsers / Number(limit))

        res.status(200).json({
            customers: users,
            pagination: { totalUsers, totalPages, currentPage: Number(page), pageSize: Number(limit) },
        })
    } catch (error) {
        next(error)
    }
}

// GET /customers/:id
export const getCustomerById = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        if (!isValidObjectId(id)) return next(new NotFoundError('Передан не валидный ID пользователя'))

        const user = await User.findById(id).populate(['orders', 'lastOrder']).orFail(
            () => new NotFoundError('Пользователь не найден')
        )

        res.status(200).json(user)
    } catch (error) {
        next(error)
    }
}

// PATCH /customers/:id
export const updateCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        if (!isValidObjectId(id)) return next(new NotFoundError('Передан не валидный ID пользователя'))

        const allowedFields = ['name', 'email', 'password']
        const updateData: any = {}
        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) updateData[field] = req.body[field]
        })

        const updatedUser = await User.findByIdAndUpdate(id, updateData, { new: true })
            .populate(['orders', 'lastOrder'])
            .orFail(() => new NotFoundError('Пользователь не найден'))

        res.status(200).json(updatedUser)
    } catch (error) {
        next(error)
    }
}

// DELETE /customers/:id
export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { id } = req.params
        if (!isValidObjectId(id)) return next(new NotFoundError('Передан не валидный ID пользователя'))

        const deletedUser = await User.findByIdAndDelete(id).orFail(
            () => new NotFoundError('Пользователь не найден')
        )
        res.status(200).json(deletedUser)
    } catch (error) {
        next(error)
    }
}
