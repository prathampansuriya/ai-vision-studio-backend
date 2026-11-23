import { PrismaService } from './prisma.service.js';
import { AppError } from '../utils/appError.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { emailService } from '../integrations/email.service.js';
import { NotificationService } from './notification.service.js';
import { NotificationType } from '@prisma/client';
import { cloudinaryService } from '../integrations/cloudinary.service.js';
import {
  UpdateProfileInput,
  ChangePasswordInput,
} from '../validators/user.validator.js';

export class UserService {
  /**
   * Retrieves the comprehensive user profile and account details.
   * Excludes sensitive fields like passwordHash or OAuth tokens.
   */
  public static async getProfile(userId: string) {
    const user = await PrismaService.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        authProvider: true,
        accountStatus: true,
        role: true,
        emailVerified: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        profile: {
          select: {
            id: true,
            headline: true,
            bio: true,
            company: true,
            location: true,
            timezone: true,
            preferredLanguage: true,
            theme: true,
            cameraDeviceId: true,
            microphoneDeviceId: true,
            speakerDeviceId: true,
            aiVoice: true,
            responseStyle: true,
            personaTone: true,
            volume: true,
            autoPlayAudio: true,
            interruptSensitivity: true,
            playbackSpeed: true,
            focusInstruction: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        oauthAccounts: {
          select: {
            id: true,
            provider: true,
            providerAccountId: true,
            email: true,
            profilePicture: true,
            createdAt: true,
          },
        },
        notificationPreferences: {
          select: {
            emailSessionSummaries: true,
            emailBillingAlerts: true,
            emailCreditLowAlerts: true,
            inAppSessionAlerts: true,
            inAppSecurityAlerts: true,
            creditThresholdAlert: true,
          },
        },
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { balanceAfter: true },
        },
        subscription: {
          select: {
            id: true,
            status: true,
            billingInterval: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: {
              select: {
                id: true,
                name: true,
                tier: true,
                monthlyCredits: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    const creditBalance = user.creditLedgerEntries[0]?.balanceAfter ?? 0;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider,
      accountStatus: user.accountStatus,
      role: user.role,
      emailVerified: user.emailVerified,
      emailVerifiedAt: user.emailVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile || {
        headline: null,
        bio: null,
        company: null,
        location: null,
        timezone: 'UTC',
        preferredLanguage: 'en',
        theme: 'system',
        cameraDeviceId: null,
        microphoneDeviceId: null,
        speakerDeviceId: null,
        aiVoice: 'Puck',
        responseStyle: 'CONCISE',
        personaTone: 'PROFESSIONAL',
        volume: 100,
        autoPlayAudio: true,
        interruptSensitivity: 'BALANCED',
        playbackSpeed: 1.0,
        focusInstruction: 'TASK',
      },
      oauthAccounts: user.oauthAccounts,
      notificationPreferences: user.notificationPreferences || {
        emailSessionSummaries: true,
        emailBillingAlerts: true,
        emailCreditLowAlerts: true,
        inAppSessionAlerts: true,
        inAppSecurityAlerts: true,
        creditThresholdAlert: 20,
      },
      creditBalance,
      subscription: user.subscription,
    };
  }

  /**
   * Updates user name and profile metadata.
   */
  public static async updateProfile(userId: string, input: UpdateProfileInput) {
    const {
      name,
      headline,
      bio,
      company,
      location,
      timezone,
      preferredLanguage,
      theme,
      cameraDeviceId,
      microphoneDeviceId,
      speakerDeviceId,
      aiVoice,
      responseStyle,
      personaTone,
      volume,
      autoPlayAudio,
      interruptSensitivity,
      playbackSpeed,
      focusInstruction,
    } = input;

    // 1. Update user name if passed
    if (name !== undefined) {
      await PrismaService.client.user.update({
        where: { id: userId },
        data: { name: name.trim() },
      });
    }

    // 2. Upsert profile metadata
    const profileData: any = {};
    if (headline !== undefined) profileData.headline = headline ? headline.trim() : null;
    if (bio !== undefined) profileData.bio = bio ? bio.trim() : null;
    if (company !== undefined) profileData.company = company ? company.trim() : null;
    if (location !== undefined) profileData.location = location ? location.trim() : null;
    if (timezone !== undefined) profileData.timezone = timezone.trim();
    if (preferredLanguage !== undefined) profileData.preferredLanguage = preferredLanguage.trim();
    if (theme !== undefined) profileData.theme = theme;
    if (cameraDeviceId !== undefined) profileData.cameraDeviceId = cameraDeviceId ? cameraDeviceId.trim() : null;
    if (microphoneDeviceId !== undefined) profileData.microphoneDeviceId = microphoneDeviceId ? microphoneDeviceId.trim() : null;
    if (speakerDeviceId !== undefined) profileData.speakerDeviceId = speakerDeviceId ? speakerDeviceId.trim() : null;
    if (aiVoice !== undefined) profileData.aiVoice = aiVoice;
    if (responseStyle !== undefined) profileData.responseStyle = responseStyle;
    if (personaTone !== undefined) profileData.personaTone = personaTone;
    if (volume !== undefined) profileData.volume = volume;
    if (autoPlayAudio !== undefined) profileData.autoPlayAudio = autoPlayAudio;
    if (interruptSensitivity !== undefined) profileData.interruptSensitivity = interruptSensitivity;
    if (playbackSpeed !== undefined) profileData.playbackSpeed = playbackSpeed;
    if (focusInstruction !== undefined) profileData.focusInstruction = focusInstruction;

    if (Object.keys(profileData).length > 0) {
      await PrismaService.client.userProfile.upsert({
        where: { userId },
        update: profileData,
        create: {
          userId,
          ...profileData,
        },
      });
    }

    return this.getProfile(userId);
  }

  /**
   * Updates user avatar URL and removes old asset from Cloudinary storage.
   */
  public static async updateAvatar(userId: string, avatarUrl: string, _publicId?: string) {
    const existing = await PrismaService.client.user.findUnique({
      where: { id: userId },
      select: { avatarUrl: true },
    });

    if (existing?.avatarUrl && existing.avatarUrl !== avatarUrl && existing.avatarUrl.includes('res.cloudinary.com')) {
      // Clean up previous image asset asynchronously
      cloudinaryService.deleteImage(existing.avatarUrl).catch(() => {});
    }

    await PrismaService.client.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return this.getProfile(userId);
  }

  /**
   * Secure local password change workflow with Google SSO guardrail.
   */
  public static async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await PrismaService.client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        authProvider: true,
      },
    });

    if (!user) {
      throw AppError.notFound('User not found');
    }

    // Google-only account guardrail
    if (user.authProvider === 'GOOGLE' && !user.passwordHash) {
      throw AppError.badRequest(
        'Your account is authenticated via Google. Password management is not applicable.'
      );
    }

    // Verify current password for local accounts
    if (!user.passwordHash) {
      throw AppError.badRequest('No password set for this account. Please use password reset.');
    }

    const isMatch = await comparePassword(input.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw AppError.badRequest('The current password entered is incorrect.');
    }

    // Hash and persist new password
    const newPasswordHash = await hashPassword(input.newPassword);
    await PrismaService.client.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Dispatch security alert email and in-app notification
    emailService.sendPasswordChangedAlert(user.email, user.name || 'there').catch(() => {});

    NotificationService.createNotification(user.id, {
      type: NotificationType.SECURITY,
      title: 'Security Alert: Password Changed',
      message: 'Your account password was successfully updated. If you did not make this change, please contact security immediately.',
      actionUrl: '/profile',
    }).catch(() => {});

    return {
      success: true,
      message: 'Password updated successfully.',
    };
  }

  /**
   * Retrieves linked OAuth identities for the authenticated user.
   */
  public static async getConnectedAccounts(userId: string) {
    const accounts = await PrismaService.client.oAuthAccount.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        providerAccountId: true,
        email: true,
        profilePicture: true,
        createdAt: true,
      },
    });

    return accounts;
  }
}
