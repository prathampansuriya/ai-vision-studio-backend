import { Request, Response, NextFunction } from 'express';
import { cloudinaryService } from '../integrations/cloudinary.service.js';
import { UserService } from '../services/user.service.js';
import { sendSuccess } from '../utils/response.js';
import { HTTP_STATUS } from '@shared/constants/index.js';

export class UploadController {
  /**
   * Generates a signed upload ticket for direct browser-to-Cloudinary upload.
   * Eliminates server file buffering and protects Cloudinary secrets.
   */
  public static async getSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const folder = req.body?.folder || 'ai-vision-studio/avatars';
      const publicId = req.body?.publicId || `avatar_${req.user!.id}_${Date.now()}`;
      const signatureData = cloudinaryService.generateUploadSignature(folder, publicId);

      sendSuccess(
        res,
        signatureData,
        'Upload signature generated successfully.',
        HTTP_STATUS.OK
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Server-side upload endpoint for avatars.
   * Validates MIME type and size, uploads to Cloudinary, updates user record, and cleans old asset.
   */
  public static async uploadAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { image, publicId } = req.body;
      const targetPublicId = publicId || `user_${req.user!.id}_${Date.now()}`;

      const uploadResult = await cloudinaryService.uploadImage(
        image,
        'ai-vision-studio/avatars',
        targetPublicId
      );

      // Immediately synchronize user's avatar in the database
      const updatedProfile = await UserService.updateAvatar(
        req.user!.id,
        uploadResult.url,
        uploadResult.publicId
      );

      sendSuccess(
        res,
        {
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          profile: updatedProfile,
        },
        'Avatar uploaded and updated successfully.',
        HTTP_STATUS.OK
      );
    } catch (error) {
      next(error);
    }
  }
}
