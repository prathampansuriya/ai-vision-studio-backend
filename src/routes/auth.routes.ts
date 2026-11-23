import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { validateBody } from '../middleware/validate.js';
import { strictRateLimiter } from '../middleware/rateLimiter.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from '../validators/auth.validator.js';

const router = Router();

// 1. Local Registration
router.post('/register', strictRateLimiter, validateBody(registerSchema), AuthController.register);

// 2. Email OTP Verification
router.post('/verify-otp', strictRateLimiter, validateBody(verifyOtpSchema), AuthController.verifyOtp);

// 3. Resend OTP
router.post('/resend-otp', strictRateLimiter, validateBody(resendOtpSchema), AuthController.resendOtp);

// 4. Local Email & Password Login
router.post('/login', strictRateLimiter, validateBody(loginSchema), AuthController.login);

// 5. Google OAuth Login / Registration / Linking
router.post('/google', strictRateLimiter, validateBody(googleAuthSchema), AuthController.googleLogin);

// 6. Forgot Password Request
router.post(
  '/forgot-password',
  strictRateLimiter,
  validateBody(forgotPasswordSchema),
  AuthController.forgotPassword
);

// 7. Reset Password Confirmation
router.post(
  '/reset-password',
  strictRateLimiter,
  validateBody(resetPasswordSchema),
  AuthController.resetPassword
);

// 8. Refresh Token
router.post('/refresh', validateBody(refreshTokenSchema), AuthController.refreshToken);

// 9. Logout
router.post('/logout', AuthController.logout);

// 10. Authenticated User Profile
router.get('/me', authenticate, requireAuth, AuthController.getMe);

export const authRoutes = router;
