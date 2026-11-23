import { Router } from 'express';
import { UploadController } from '../controllers/upload.controller.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import {
  uploadSignatureSchema,
  uploadAvatarSchema,
} from '../validators/user.validator.js';

const router = Router();

// Enforce authentication on all media upload routes
router.use(authenticate, requireAuth);

// 1. Generate client upload signature for direct Cloudinary upload
router.post(
  '/signature',
  validateBody(uploadSignatureSchema),
  UploadController.getSignature
);

// 2. Server-side avatar upload (strict rate limiting, max 5MB base64)
router.post(
  '/avatar',
  strictRateLimiter,
  validateBody(uploadAvatarSchema),
  UploadController.uploadAvatar
);

export const uploadRoutes = router;
