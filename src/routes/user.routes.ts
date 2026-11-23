import { Router } from 'express';
import { UserController } from '../controllers/user.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import {
  updateProfileSchema,
  updateAvatarSchema,
  changePasswordSchema,
} from '../validators/user.validator.js';

const router = Router();

// Enforce authentication on all user routes
router.use(authenticate, requireAuth);

// 1. Get complete user profile
router.get('/profile', UserController.getProfile);

// 2. Update user name and profile metadata
router.patch('/profile', validateBody(updateProfileSchema), UserController.updateProfile);
router.put('/profile', validateBody(updateProfileSchema), UserController.updateProfile);

// 3. Update profile avatar URL
router.patch('/avatar', validateBody(updateAvatarSchema), UserController.updateAvatar);

// 4. Change local account password (strict rate limiting)
router.patch(
  '/password',
  strictRateLimiter,
  validateBody(changePasswordSchema),
  UserController.changePassword
);

// 5. Get connected OAuth accounts (Google identity)
router.get('/connected-accounts', UserController.getConnectedAccounts);

export const userRoutes = router;
