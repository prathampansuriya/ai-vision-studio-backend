import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import crypto from 'crypto';
import { env } from '../config/env.config.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../utils/appError.js';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

export interface UploadSignatureResult {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
  publicId?: string;
}

export class CloudinaryService {
  private isConfigured: boolean = false;

  constructor() {
    this.initCloudinary();
  }

  private initCloudinary(): void {
    if (env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET) {
      cloudinary.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      this.isConfigured = true;
      logger.info('☁️ Cloudinary SDK configured successfully for media storage.');
    } else {
      this.isConfigured = false;
      logger.warn(
        '⚠️ Cloudinary environment variables (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) not fully provided. Media service operating in mock/fallback mode.'
      );
    }
  }

  /**
   * Generates a signed upload ticket for direct client-to-Cloudinary uploads.
   * This guarantees client uploads are authenticated without exposing the Cloudinary API secret.
   */
  public generateUploadSignature(
    folder: string = 'ai-vision-studio/avatars',
    publicId?: string
  ): UploadSignatureResult {
    const timestamp = Math.round(new Date().getTime() / 1000);

    const paramsToSign: Record<string, string | number> = {
      timestamp,
      folder,
    };

    if (publicId) {
      paramsToSign.public_id = publicId;
    }

    if (!this.isConfigured) {
      // Mock signature for offline dev / automated testing
      const mockSecret = 'mock_cloudinary_secret_dev';
      const mockSignature = crypto
        .createHash('sha1')
        .update(`folder=${folder}&timestamp=${timestamp}${mockSecret}`)
        .digest('hex');

      return {
        timestamp,
        signature: mockSignature,
        apiKey: env.CLOUDINARY_API_KEY || 'mock_api_key_12345678',
        cloudName: env.CLOUDINARY_CLOUD_NAME || 'mock-cloud',
        folder,
        publicId,
      };
    }

    const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);

    return {
      timestamp,
      signature,
      apiKey: env.CLOUDINARY_API_KEY,
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      folder,
      publicId,
    };
  }

  /**
   * Uploads an image data URI or base64 buffer via server-side pipeline.
   * Enforces avatar dimension and quality optimization.
   */
  public async uploadImage(
    fileDataUri: string,
    folder: string = 'ai-vision-studio/avatars',
    publicId?: string
  ): Promise<CloudinaryUploadResult> {
    if (!fileDataUri) {
      throw AppError.badRequest('No image data provided for upload');
    }

    // Client-side payload size check (max ~5MB encoded payload)
    const approximateBytes = Math.round((fileDataUri.length * 3) / 4);
    if (approximateBytes > 5 * 1024 * 1024) {
      throw AppError.badRequest('Uploaded image exceeds 5MB size limit');
    }

    // In mock mode (e.g. tests or dev without Cloudinary credentials):
    if (!this.isConfigured) {
      const mockPublicId = publicId || `mock_avatar_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      logger.info(`[Cloudinary Mock] Processed upload for folder: ${folder}, id: ${mockPublicId}`);
      return {
        url: `https://res.cloudinary.com/demo/image/upload/v1/ai-vision-studio/avatars/${mockPublicId}.webp`,
        publicId: `${folder}/${mockPublicId}`,
        width: 400,
        height: 400,
        format: 'webp',
        bytes: approximateBytes,
      };
    }

    try {
      const result: UploadApiResponse = await cloudinary.uploader.upload(fileDataUri, {
        folder,
        public_id: publicId,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'webp' },
        ],
        overwrite: true,
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (err: any) {
      logger.error('Cloudinary upload failure:', err);
      throw AppError.badRequest(`Image upload failed: ${err.message || 'Storage server error'}`);
    }
  }

  /**
   * Dedicated snapshot uploader: preserves high resolution, aspect ratio,
   * optimizes format to webp/jpg, and manages custom folders.
   */
  public async uploadSnapshotImage(
    fileDataUri: string,
    folder: string = 'ai-vision-studio/snapshots',
    publicId?: string
  ): Promise<CloudinaryUploadResult> {
    if (!fileDataUri) {
      throw AppError.badRequest('No snapshot image data provided for upload');
    }

    // Client-side payload size check (max ~10MB encoded base64 payload for high-res frames)
    const approximateBytes = Math.round((fileDataUri.length * 3) / 4);
    if (approximateBytes > 10 * 1024 * 1024) {
      throw AppError.badRequest('Snapshot frame exceeds maximum 10MB size limit');
    }

    if (!this.isConfigured) {
      const mockPublicId = publicId || `mock_snap_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      logger.info(`[Cloudinary Mock] Processed snapshot upload for folder: ${folder}, id: ${mockPublicId}`);
      return {
        url: `https://res.cloudinary.com/demo/image/upload/v1/ai-vision-studio/snapshots/${mockPublicId}.webp`,
        publicId: `${folder}/${mockPublicId}`,
        width: 1280,
        height: 720,
        format: 'webp',
        bytes: approximateBytes,
      };
    }

    try {
      const result: UploadApiResponse = await cloudinary.uploader.upload(fileDataUri, {
        folder,
        public_id: publicId,
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [
          { quality: 'auto:good', fetch_format: 'webp' },
        ],
        overwrite: true,
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
        bytes: result.bytes,
      };
    } catch (err: any) {
      logger.error('Cloudinary snapshot upload failure:', err);
      throw AppError.badRequest(`Snapshot upload failed: ${err.message || 'Storage server error'}`);
    }
  }

  /**
   * Deletes an image from Cloudinary storage when an avatar is replaced or removed.
   */
  public async deleteImage(publicIdOrUrl: string): Promise<boolean> {
    if (!publicIdOrUrl) return false;

    const publicId = this.extractPublicId(publicIdOrUrl);
    if (!publicId) return false;

    if (!this.isConfigured) {
      logger.info(`[Cloudinary Mock] Deleting asset with publicId: ${publicId}`);
      return true;
    }

    try {
      const res = await cloudinary.uploader.destroy(publicId, { invalidate: true });
      return res.result === 'ok';
    } catch (err) {
      logger.warn(`Failed to delete Cloudinary asset ${publicId}:`, err);
      return false;
    }
  }

  /**
   * Safely extracts public_id from a Cloudinary URL or returns raw ID.
   */
  private extractPublicId(urlOrId: string): string | null {
    if (!urlOrId.includes('/') && !urlOrId.includes('.')) {
      return urlOrId;
    }

    try {
      // Example: https://res.cloudinary.com/cloud/image/upload/v12345/ai-vision-studio/avatars/user_123.webp
      const parts = urlOrId.split('/upload/');
      if (parts.length > 1) {
        const afterUpload = parts[1];
        // Strip version prefix v123456/ if present
        const withoutVersion = afterUpload.replace(/^v\d+\//, '');
        // Strip file extension
        const lastDotIndex = withoutVersion.lastIndexOf('.');
        if (lastDotIndex > 0) {
          return withoutVersion.substring(0, lastDotIndex);
        }
        return withoutVersion;
      }
      return urlOrId;
    } catch {
      return null;
    }
  }
}

export const cloudinaryService = new CloudinaryService();
