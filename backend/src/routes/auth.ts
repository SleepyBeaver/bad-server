import { Router } from 'express';
import {
  getCurrentUser,
  getCurrentUserRoles,
  login,
  logout,
  refreshAccessToken,
  register,
  updateCurrentUser,
} from '../controllers/auth';
import auth from '../middlewares/auth';
import { sanitizeBody } from '../middlewares/sanitizeBody';

const authRouter = Router();

authRouter.get('/user', auth, getCurrentUser);
authRouter.patch('/me', auth, sanitizeBody(['name', 'email']), updateCurrentUser);
authRouter.get('/user/roles', auth, getCurrentUserRoles);
authRouter.post('/login', sanitizeBody(['email', 'password']), login);
authRouter.get('/token', refreshAccessToken);
authRouter.get('/logout', logout);
authRouter.post('/register', sanitizeBody(['email', 'password', 'name']), register);

export default authRouter;
