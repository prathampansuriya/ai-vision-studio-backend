import { z } from 'zod';
import { passwordComplexitySchema } from '../utils/password.js';

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters long')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),
  headline: z
    .string()
    .trim()
    .max(120, 'Headline cannot exceed 120 characters')
    .nullable()
    .optional(),
  bio: z
    .string()
    .trim()
    .max(1000, 'Bio cannot exceed 1000 characters')
    .nullable()
    .optional(),
  company: z
    .string()
    .trim()
    .max(100, 'Company cannot exceed 100 characters')
    .nullable()
    .optional(),
  location: z
    .string()
    .trim()
    .max(100, 'Location cannot exceed 100 characters')
    .nullable()
    .optional(),
  timezone: z.string().trim().max(50).optional(),
  preferredLanguage: z.string().trim().max(10).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
  cameraDeviceId: z.string().trim().max(200).nullable().optional(),
  microphoneDeviceId: z.string().trim().max(200).nullable().optional(),
  speakerDeviceId: z.string().trim().max(200).nullable().optional(),
  aiVoice: z.enum(['Puck', 'Charon', 'Aoede', 'Fenrir', 'Kore']).optional(),
  responseStyle: z.enum(['CONCISE', 'BALANCED', 'DETAILED']).optional(),
  personaTone: z.enum(['PROFESSIONAL', 'FRIENDLY', 'TUTOR']).optional(),
  volume: z.number().min(0).max(100).optional(),
  autoPlayAudio: z.boolean().optional(),
  interruptSensitivity: z.enum(['HIGH', 'BALANCED', 'MANUAL_ONLY']).optional(),
  playbackSpeed: z.number().min(0.5).max(2.0).optional(),
  focusInstruction: z.enum(['CODE', 'UI', 'TEXT', 'OBJECTS', 'CHANGES', 'TASK', 'CUSTOM']).optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordComplexitySchema,
    confirmPassword: z.string().min(1, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'New passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from current password',
    path: ['newPassword'],
  });

export const updateAvatarSchema = z.object({
  avatarUrl: z.string().url('Avatar URL must be a valid URL'),
  publicId: z.string().optional(),
});

export const uploadAvatarSchema = z.object({
  image: z
    .string()
    .min(1, 'Image data is required')
    .refine(
      (val) => {
        return (
          val.startsWith('data:image/jpeg;base64,') ||
          val.startsWith('data:image/png;base64,') ||
          val.startsWith('data:image/webp;base64,') ||
          val.startsWith('data:image/jpg;base64,')
        );
      },
      {
        message: 'Invalid image format. Supported formats are JPEG, PNG, and WebP.',
      }
    ),
  publicId: z.string().optional(),
});

export const uploadSignatureSchema = z.object({
  folder: z.string().optional().default('ai-vision-studio/avatars'),
  publicId: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;
export type UploadAvatarInput = z.infer<typeof uploadAvatarSchema>;
export type UploadSignatureInput = z.infer<typeof uploadSignatureSchema>;
