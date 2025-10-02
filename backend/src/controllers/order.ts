import { NextFunction, Request, Response } from 'express'
import { Types, isValidObjectId, FilterQuery, Error as MongooseError } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'
import escapeRegExp from '../utils/escapeRegExp'
import { normalizeLimit } from '../utils/normalizeLimit'

const safeSearch = (search: string) => new RegExp(escapeRegExp(search.slice(0, 100)), 'i')

const toPageNumber = (value: any) => {
  const p = Number(value)
  return Number.isFinite(p) && p > 0 ? Math.floor(p) : 1
}

// GET /orders
export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Number(req.query.page) || 1
    const limit = normalizeLimit(req.query.limit, 10, 10)
    const { sortField = 'createdAt', sortOrder = 'desc', status, totalAmountFrom, totalAmountTo, orderDateFrom, orderDateTo, search } = req.query

    const filters: any = {}
    if (status) filters.status = status
    if (totalAmountFrom) filters.totalAmount = { ...filters.totalAmount, $gte: Number(totalAmountFrom) }
    if (totalAmountTo) filters.totalAmount = { ...filters.totalAmount, $lte: Number(totalAmountTo) }
    if (orderDateFrom) filters.createdAt = { ...filters.createdAt, $gte: new Date(orderDateFrom as string) }
    if (orderDateTo) filters.createdAt = { ...filters.createdAt, $lte: new Date(orderDateTo as string) }

    const aggregatePipeline: any[] = [
      { $match: filters },
      { $lookup: { from: 'products', localField: 'products', foreignField: '_id', as: 'products' } },
      { $lookup: { from: 'users', localField: 'customer', foreignField: '_id', as: 'customer' } },
      { $unwind: '$customer' },
      { $unwind: '$products' },
    ]

    if (search) {
      const searchRegex = new RegExp(search as string, 'i')
      const searchNumber = Number(search)
      const searchConditions: any[] = [{ 'products.title': searchRegex }]
      if (!Number.isNaN(searchNumber)) searchConditions.push({ orderNumber: searchNumber })
      aggregatePipeline.push({ $match: { $or: searchConditions } })
      filters.$or = searchConditions
    }

    const sort: Record<string, any> = {}
    sort[sortField as string] = sortOrder === 'desc' ? -1 : 1

    aggregatePipeline.push(
      { $sort: sort },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $group: { _id: '$_id', orderNumber: { $first: '$orderNumber' }, status: { $first: '$status' }, totalAmount: { $first: '$totalAmount' }, products: { $push: '$products' }, customer: { $first: '$customer' }, createdAt: { $first: '$createdAt' } } }
    )

    const orders = await Order.aggregate(aggregatePipeline)
    const totalOrders = await Order.countDocuments(filters)
    const totalPages = Math.ceil(totalOrders / limit)

    res.status(200).json({ orders, pagination: { totalOrders, totalPages, currentPage: page, pageSize: limit } })
  } catch (error) {
    next(error)
  }
}

// GET orders for current user
export const getOrdersCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = res.locals.user._id as Types.ObjectId
    const { search, page = 1, limit = 5 } = req.query

    const pageNum = toPageNumber(page)
    const limitNum = normalizeLimit(limit, 5, 10)
    const options = { skip: (pageNum - 1) * limitNum, limit: limitNum }

    const user = await User.findById(userId)
      .populate({ path: 'orders', populate: [{ path: 'products' }, { path: 'customer' }] })
      .orFail(() => new NotFoundError('Пользователь не найден'))

    let orders = user.orders as unknown as IOrder[]

    if (search && typeof search === 'string') {
      if (search.length > 100) return next(new BadRequestError('Некорректный параметр поиска'))

      const searchRegex = safeSearch(search)
      const searchNumber = Number(search)
      const products = await Product.find({ title: searchRegex })
      const productIds = products.map((p) => p._id as Types.ObjectId)

      orders = orders.filter((order) => {
        const matchesProduct = order.products.some((p) =>
          productIds.some((id) => (p._id as Types.ObjectId).equals(id))
        )
        const matchesNumber = !Number.isNaN(searchNumber) && Number.isSafeInteger(searchNumber) && searchNumber > 0
          ? order.orderNumber === searchNumber
          : false
        return matchesProduct || matchesNumber
      })
    }

    const totalOrders = orders.length
    const totalPages = Math.ceil(totalOrders / limitNum)
    orders = orders.slice(options.skip, options.skip + options.limit)

    res.status(200).json({
      orders,
      pagination: { totalOrders, totalPages, currentPage: pageNum, pageSize: limitNum },
    })
  } catch (error) {
    next(error)
  }
}

// GET order by number
export const getOrderByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ не найден'))
    res.status(200).json(order)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Неверный ID заказа'))
    next(error)
  }
}

// GET order of current user by number
export const getOrderCurrentUserByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = res.locals.user._id as Types.ObjectId
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ не найден'))

    if (!(order.customer._id as Types.ObjectId).equals(userId)) return next(new NotFoundError('Заказ не найден'))
    res.status(200).json(order)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Неверный ID заказа'))
    next(error)
  }
}

// CREATE order
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { address, payment, phone, total, email, items, comment } = req.body
    const basket: IProduct[] = []

    if (!Array.isArray(items) || items.length === 0) return next(new BadRequestError('Не указаны товары'))
    if (items.length > 50) return next(new BadRequestError('Слишком много товаров в заказе'))

    const invalidId = items.find((id) => !isValidObjectId(id))
    if (invalidId) {
      return next(new BadRequestError(`Невалидный id товара: ${invalidId}`))
    }

    const products = await Product.find({ _id: { $in: items } })
    if (products.length !== items.length) return next(new BadRequestError('Один или несколько товаров не найдены'))

    products.forEach((product) => {
      if (product.price === null) throw new BadRequestError(`Товар ${product._id} не продается`)
      basket.push(product)
    })

    const totalBasket = basket.reduce((sum, p) => sum + p.price, 0)
    if (totalBasket !== total) return next(new BadRequestError('Неверная сумма заказа'))

    const userId = res.locals.user._id as Types.ObjectId
    const newOrder = new Order({ totalAmount: total, products: items, payment, phone, email, comment, customer: userId, deliveryAddress: address })
    const populateOrder = await newOrder.populate(['customer', 'products'])
    await populateOrder.save()
    res.status(200).json(populateOrder)
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
    next(error)
  }
}

// UPDATE order
export const updateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: req.params.orderNumber },
      { status },
      { new: true, runValidators: true }
    )
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ не найден'))

    res.status(200).json(updatedOrder)
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Неверный ID заказа'))
    next(error)
  }
}

// DELETE order
export const deleteOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id)
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ не найден'))
    res.status(200).json(deletedOrder)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Неверный ID заказа'))
    next(error)
  }
}
