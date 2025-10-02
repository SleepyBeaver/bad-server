import { Router } from 'express';
import {
  deleteCustomer,
  getCustomerById,
  getCustomers,
  updateCustomer,
} from '../controllers/customers';
import auth from '../middlewares/auth';
import { sanitizeBody } from '../middlewares/sanitizeBody';

const customerRouter = Router();

customerRouter.get('/', auth, getCustomers);
customerRouter.get('/:id', auth, getCustomerById);
customerRouter.patch('/:id', auth, sanitizeBody(['name', 'email']), updateCustomer);
customerRouter.delete('/:id', auth, deleteCustomer);

export default customerRouter;
