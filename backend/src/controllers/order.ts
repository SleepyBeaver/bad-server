import { NextFunction, Request, Response } from 'express'
import { Error as MongooseError, Types } from 'mongoose'
import BadRequestError from '../errors/bad-request-error'
import NotFoundError from '../errors/not-found-error'
import Order, { IOrder } from '../models/order'
import Product, { IProduct } from '../models/product'
import User from '../models/user'

// GET /orders
export const getOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortField = 'createdAt',
      sortOrder = 'desc',
      status,
      totalAmountFrom,
      totalAmountTo,
      orderDateFrom,
      orderDateTo,
      search,
    } = req.query

    const filters: any = {}

    if (status) {
      filters.status = typeof status === 'string' ? status : status
    }
    if (totalAmountFrom) {
      filters.totalAmount = { ...filters.totalAmount, $gte: Number(totalAmountFrom) }
    }
    if (totalAmountTo) {
      filters.totalAmount = { ...filters.totalAmount, $lte: Number(totalAmountTo) }
    }
    if (orderDateFrom) {
      filters.createdAt = { ...filters.createdAt, $gte: new Date(orderDateFrom as string) }
    }
    if (orderDateTo) {
      filters.createdAt = { ...filters.createdAt, $lte: new Date(orderDateTo as string) }
    }

    const aggregatePipeline: any[] = [
      { $match: filters },
      {
        $lookup: {
          from: 'products',
          localField: 'products',
          foreignField: '_id',
          as: 'products',
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'customer',
          foreignField: '_id',
          as: 'customer',
        },
      },
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
      { $skip: (Number(page) - 1) * Number(limit) },
      { $limit: Number(limit) },
      {
        $group: {
          _id: '$_id',
          orderNumber: { $first: '$orderNumber' },
          status: { $first: '$status' },
          totalAmount: { $first: '$totalAmount' },
          products: { $push: '$products' },
          customer: { $first: '$customer' },
          createdAt: { $first: '$createdAt' },
        },
      }
    )

    const orders = await Order.aggregate(aggregatePipeline)
    const totalOrders = await Order.countDocuments(filters)
    const totalPages = Math.ceil(totalOrders / Number(limit))

    res.status(200).json({
      orders,
      pagination: {
        totalOrders,
        totalPages,
        currentPage: Number(page),
        pageSize: Number(limit),
      },
    })
  } catch (error) {
    next(error)
  }
}

// GET /orders/me
export const getOrdersCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = res.locals.user._id as Types.ObjectId
    const { search, page = 1, limit = 5 } = req.query
    const options = { skip: (Number(page) - 1) * Number(limit), limit: Number(limit) }

    const user = await User.findById(userId)
      .populate({
        path: 'orders',
        populate: [{ path: 'products' }, { path: 'customer' }],
      })
      .orFail(() => new NotFoundError('Пользователь по заданному id отсутствует в базе'))

    let orders = user.orders as unknown as IOrder[]

    if (search) {
      const searchRegex = new RegExp(search as string, 'i')
      const searchNumber = Number(search)
      const products = await Product.find({ title: searchRegex })
      const productIds = products.map((p) => p._id)

      orders = orders.filter((order) => {
        const matchesProductTitle = order.products.some((p) => {
          const productId = p instanceof Types.ObjectId ? p : p._id
          return productIds.some((id) => id.equals(productId))
        })
        const matchesOrderNumber = !Number.isNaN(searchNumber) && order.orderNumber === searchNumber
        return matchesOrderNumber || matchesProductTitle
      })
    }

    const totalOrders = orders.length
    const totalPages = Math.ceil(totalOrders / Number(limit))
    orders = orders.slice(options.skip, options.skip + options.limit)

    res.status(200).json({
      orders,
      pagination: { totalOrders, totalPages, currentPage: Number(page), pageSize: Number(limit) },
    })
  } catch (error) {
    next(error)
  }
}

// GET /orders/:orderNumber
export const getOrderByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному id отсутствует в базе'))
    res.status(200).json(order)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Передан не валидный ID заказа'))
    next(error)
  }
}

// GET /orders/me/:orderNumber
export const getOrderCurrentUserByNumber = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = res.locals.user._id as Types.ObjectId
    const order = await Order.findOne({ orderNumber: req.params.orderNumber })
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному id отсутствует в базе'))

    if (order.customer instanceof Types.ObjectId) {
      if (!order.customer.equals(userId)) {
        return next(new NotFoundError('Заказ по заданному id отсутствует в базе'))
      }
    } else if (!order.customer._id.equals(userId)) {
      return next(new NotFoundError('Заказ по заданному id отсутствует в базе'))
    }

    res.status(200).json(order)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Передан не валидный ID заказа'))
    next(error)
  }
}

// POST /orders
export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const basket: IProduct[] = []
    const products = await Product.find<IProduct>({})
    const userId = res.locals.user._id as Types.ObjectId
    const { address, payment, phone, total, email, items, comment } = req.body

    items.forEach((id: Types.ObjectId) => {
      const product = products.find((p) => p._id.equals(id))
      if (!product) throw new BadRequestError(`Товар с id ${id} не найден`)
      if (product.price === null) throw new BadRequestError(`Товар с id ${id} не продается`)
      basket.push(product)
    })

    const totalBasket = basket.reduce((a, c) => a + c.price, 0)
    if (totalBasket !== total) return next(new BadRequestError('Неверная сумма заказа'))

    const newOrder = new Order({
      totalAmount: total,
      products: items,
      payment,
      phone,
      email,
      comment,
      customer: userId,
      deliveryAddress: address,
    })

    const populateOrder = await newOrder.populate(['customer', 'products'])
    await populateOrder.save()

    res.status(200).json(populateOrder)
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
    next(error)
  }
}

// PATCH /orders/:orderNumber
export const updateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.body
    const updatedOrder = await Order.findOneAndUpdate(
      { orderNumber: req.params.orderNumber },
      { status },
      { new: true, runValidators: true }
    )
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному id отсутствует в базе'))

    res.status(200).json(updatedOrder)
  } catch (error) {
    if (error instanceof MongooseError.ValidationError) return next(new BadRequestError(error.message))
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Передан не валидный ID заказа'))
    next(error)
  }
}

// DELETE /orders/:id
export const deleteOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id)
      .populate(['customer', 'products'])
      .orFail(() => new NotFoundError('Заказ по заданному id отсутствует в базе'))

    res.status(200).json(deletedOrder)
  } catch (error) {
    if (error instanceof MongooseError.CastError) return next(new BadRequestError('Передан не валидный ID заказа'))
    next(error)
  }
}