import { Request, Response, NextFunction } from 'express';
import { UserService } from '../services/user.service.js';
import { sendSuccess } from '../utils/response.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

export class UserController {
  public static async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await UserService.getProfile(req.user!.id);
      sendSuccess(res, profile, 'User profile retrieved successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updatedProfile = await UserService.updateProfile(req.user!.id, req.body);
      sendSuccess(res, updatedProfile, 'Profile updated successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async updateAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await UserService.updateAvatar(
        req.user!.id,
        req.body.avatarUrl,
        req.body.publicId
      );
      sendSuccess(res, result, 'Avatar updated successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await UserService.changePassword(req.user!.id, req.body);
      sendSuccess(res, result, result.message, HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async getConnectedAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await UserService.getConnectedAccounts(req.user!.id);
      sendSuccess(res, accounts, 'Connected accounts retrieved successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
