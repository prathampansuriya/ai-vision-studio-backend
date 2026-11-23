import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { sendSuccess } from '../utils/response.js';
import { env } from '../config/index.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

const isProd = env.NODE_ENV === 'production';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
  signed: true,
};

export class AuthController {
  private static setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie('access_token', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.cookie('refresh_token', refreshToken, {
      ...COOKIE_OPTIONS,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });
  }

  private static clearAuthCookies(res: Response): void {
    const clearOpts = {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
      path: '/',
    };
    res.clearCookie('access_token', clearOpts);
    res.clearCookie('refresh_token', clearOpts);
  }

  public static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.registerLocal(req.body);
      sendSuccess(
        res,
        result,
        'Registration initiated. Please verify the code sent to your email.',
        HTTP_STATUS.CREATED
      );
    } catch (error) {
      next(error);
    }
  }

  public static async verifyOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.verifyOtp(req.body);

      if ('alreadyVerified' in result) {
        sendSuccess(res, result, result.message, HTTP_STATUS.OK);
        return;
      }

      AuthController.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
      sendSuccess(res, result, 'Email verified and account activated successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async resendOtp(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.resendOtp(req.body);
      sendSuccess(res, result, result.message, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.loginLocal(req.body);
      AuthController.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
      sendSuccess(res, result, 'Logged in successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async googleLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.loginWithGoogle(req.body);
      AuthController.setAuthCookies(res, result.tokens.accessToken, result.tokens.refreshToken);
      sendSuccess(res, result, 'Authenticated with Google successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.forgotPassword(req.body);
      sendSuccess(res, result, result.message, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await AuthService.resetPassword(req.body);
      sendSuccess(res, result, result.message, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token =
        req.body?.refreshToken ||
        (req.signedCookies && req.signedCookies.refresh_token);

      const result = await AuthService.refreshToken(token);
      AuthController.setAuthCookies(res, result.accessToken, result.refreshToken);
      sendSuccess(res, result, 'Token refreshed successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static logout(_req: Request, res: Response): void {
    AuthController.clearAuthCookies(res);
    sendSuccess(res, { loggedOut: true }, 'Logged out successfully.', HTTP_STATUS.OK);
  }

  public static async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getCurrentUser(req.user!.id);
      sendSuccess(res, user, 'User profile fetched successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
