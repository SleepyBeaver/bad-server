import { Router } from 'express';
import {
  createOrder,
  deleteOrder,
  getOrderByNumber,
  getOrderCurrentUserByNumber,
  getOrders,
  getOrdersCurrentUser,
  updateOrder,
} from '../controllers/order';
import auth, { roleGuardMiddleware } from '../middlewares/auth';
import { validateOrderBody } from '../middlewares/validations';
import { Role } from '../models/user';
import { sanitizeBody } from '../middlewares/sanitizeBody';

const orderRouter = Router();

orderRouter.post(
  '/',
  auth,
  sanitizeBody(['address', 'payment', 'phone', 'email', 'comment']),
  validateOrderBody,
  createOrder
);

orderRouter.get('/all', auth, getOrders);
orderRouter.get('/all/me', auth, getOrdersCurrentUser);

orderRouter.get(
  '/:orderNumber',
  auth,
  roleGuardMiddleware(Role.Admin),
  getOrderByNumber
);

orderRouter.get('/me/:orderNumber', auth, getOrderCurrentUserByNumber);

orderRouter.patch(
  '/:orderNumber',
  auth,
  roleGuardMiddleware(Role.Admin),
  sanitizeBody(['status']),
  updateOrder
);

orderRouter.delete(
  '/:id',
  auth,
  roleGuardMiddleware(Role.Admin),
  deleteOrder
);

export default orderRouter;
