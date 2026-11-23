import crypto from 'crypto';
import { NotificationType } from '@prisma/client';
import { PrismaService } from './prisma.service.js';
import { emailService } from '../integrations/email.service.js';
import { NotificationService } from './notification.service.js';
import { GoogleAuthService } from './googleAuth.service.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';
import { AppError } from '../utils/appError.js';
import { env } from '../config/index.js';
import { ERROR_CODES } from '@shared/constants/index.js';
import {
  RegisterInput,
  VerifyOtpInput,
  ResendOtpInput,
  LoginInput,
  GoogleAuthInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from '../validators/auth.validator.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  tokens: AuthTokens;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    creditBalance: number;
  };
}

export class AuthService {
  private static hashOtp(userId: string, otp: string): string {
    return crypto.createHash('sha256').update(`${userId}:${otp}`).digest('hex');
  }

  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private static generateOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  private static async grantWelcomeCredits(userId: string): Promise<number> {
    const existingLedger = await PrismaService.client.creditLedger.findFirst({
      where: { userId },
    });

    if (existingLedger) {
      return existingLedger.balanceAfter;
    }

    const freePlan = await PrismaService.client.plan.findUnique({
      where: { tier: 'FREE' },
    });

    const allowance = freePlan?.monthlyCredits ?? 100;

    await PrismaService.client.creditLedger.create({
      data: {
        userId,
        amount: allowance,
        balanceAfter: allowance,
        type: 'GRANT',
        reason: 'Welcome bonus credit grant',
      },
    });

    return allowance;
  }

  /**
   * 1. Local Registration
   */
  public static async registerLocal(input: RegisterInput): Promise<{
    userId: string;
    email: string;
    requiresVerification: boolean;
  }> {
    const email = input.email.trim().toLowerCase();

    // Check if user already exists
    const existingUser = await PrismaService.client.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      if (existingUser.emailVerified) {
        throw AppError.conflict('An account with this email address already exists');
      }

      // If user exists but is unverified, update name and password and re-issue OTP
      const passwordHash = await hashPassword(input.password);
      await PrismaService.client.user.update({
        where: { id: existingUser.id },
        data: {
          name: input.name,
          passwordHash,
          updatedAt: new Date(),
        },
      });

      // Invalidate existing pending verifications
      await PrismaService.client.emailVerification.updateMany({
        where: { userId: existingUser.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      // Issue new OTP
      const otp = AuthService.generateOtp();
      const hashedOtp = AuthService.hashOtp(existingUser.id, otp);

      await PrismaService.client.emailVerification.create({
        data: {
          userId: existingUser.id,
          token: hashedOtp,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
          attempts: 0,
        },
      });

      await emailService.sendVerificationOtp(email, input.name, otp);

      return {
        userId: existingUser.id,
        email,
        requiresVerification: true,
      };
    }

    // Hash password
    const passwordHash = await hashPassword(input.password);

    // Create unverified account with profile and preferences
    const user = await PrismaService.client.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email,
          name: input.name,
          passwordHash,
          authProvider: 'LOCAL',
          accountStatus: 'PENDING_VERIFICATION',
          emailVerified: false,
        },
      });

      await tx.userProfile.create({
        data: {
          userId: newUser.id,
        },
      });

      await tx.userNotificationPreferences.create({
        data: {
          userId: newUser.id,
        },
      });

      return newUser;
    });

    // Generate secure 6-digit OTP
    const otp = AuthService.generateOtp();
    const hashedOtp = AuthService.hashOtp(user.id, otp);

    await PrismaService.client.emailVerification.create({
      data: {
        userId: user.id,
        token: hashedOtp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 mins
        attempts: 0,
      },
    });

    // Send verification email
    await emailService.sendVerificationOtp(email, input.name, otp);

    return {
      userId: user.id,
      email,
      requiresVerification: true,
    };
  }

  /**
   * 2. Verify Email OTP
   */
  public static async verifyOtp(input: VerifyOtpInput): Promise<AuthResponse | { alreadyVerified: true; message: string }> {
    const email = input.email.trim().toLowerCase();

    const user = await PrismaService.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw AppError.notFound('Account not found');
    }

    if (user.emailVerified && user.accountStatus === 'ACTIVE') {
      return {
        alreadyVerified: true,
        message: 'Account is already verified. You can log in.',
      };
    }

    // Find latest pending verification record
    const verification = await PrismaService.client.emailVerification.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verification) {
      throw AppError.badRequest('No pending verification code found. Please request a new code.');
    }

    // Check expiry
    if (verification.expiresAt < new Date()) {
      await PrismaService.client.emailVerification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      });
      throw new AppError('Verification code has expired. Please request a new code.', 400, ERROR_CODES.OTP_EXPIRED);
    }

    // Check attempt limit
    if (verification.attempts >= 5) {
      await PrismaService.client.emailVerification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() },
      });
      throw AppError.badRequest('Too many failed attempts. This code has been invalidated. Please request a new code.');
    }

    // Compare OTP hash
    const inputHash = AuthService.hashOtp(user.id, input.otp.trim());

    if (inputHash !== verification.token) {
      const updated = await PrismaService.client.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });
      const remainingAttempts = Math.max(0, 5 - updated.attempts);
      throw new AppError(
        `Invalid verification code. ${remainingAttempts} attempts remaining.`,
        400,
        ERROR_CODES.INVALID_OTP,
        { remainingAttempts }
      );
    }

    // OTP is valid! Mark consumed
    await PrismaService.client.emailVerification.update({
      where: { id: verification.id },
      data: { consumedAt: new Date() },
    });

    // Activate user
    await PrismaService.client.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        accountStatus: 'ACTIVE',
      },
    });

    // Grant welcome credits
    const creditBalance = await AuthService.grantWelcomeCredits(user.id);

    // Issue tokens
    const accessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({ sub: user.id });

    // Send welcome confirmation email and create in-app notification
    emailService.sendWelcomeNotification(user.email, user.name || 'there').catch(() => {});
    NotificationService.createNotification(user.id, {
      type: NotificationType.SYSTEM,
      title: 'Welcome to AI Vision Studio',
      message: 'Your account is active. Explore live multimodal camera, screen share, and voice analysis.',
      actionUrl: '/dashboard',
    }).catch(() => {});

    return {
      tokens: { accessToken, refreshToken },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        emailVerified: true,
        creditBalance,
      },
    };
  }

  /**
   * 3. Resend OTP
   */
  public static async resendOtp(input: ResendOtpInput): Promise<{ success: boolean; message: string }> {
    const email = input.email.trim().toLowerCase();

    const user = await PrismaService.client.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Do not reveal whether user exists
      return {
        success: true,
        message: 'If an unverified account exists, a new verification code has been sent.',
      };
    }

    if (user.emailVerified) {
      return {
        success: true,
        message: 'Account is already verified. Please log in.',
      };
    }

    // Check resend cooldown (60 seconds)
    const latestVerification = await PrismaService.client.emailVerification.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (latestVerification) {
      const elapsedMs = Date.now() - latestVerification.createdAt.getTime();
      const COOLDOWN_MS = 60 * 1000;
      if (elapsedMs < COOLDOWN_MS) {
        const remainingSec = Math.ceil((COOLDOWN_MS - elapsedMs) / 1000);
        throw new AppError(
          `Please wait ${remainingSec} seconds before requesting a new code.`,
          429,
          ERROR_CODES.COOLDOWN_ACTIVE,
          { remainingSeconds: remainingSec }
        );
      }
    }

    // Check hourly limit (max 3 resends per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const hourlyCount = await PrismaService.client.emailVerification.count({
      where: {
        userId: user.id,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (hourlyCount >= 3) {
      throw AppError.tooManyRequests(
        'Maximum verification code requests reached for this hour. Please try again later.'
      );
    }

    // Invalidate existing pending codes
    await PrismaService.client.emailVerification.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    // Generate new OTP
    const otp = AuthService.generateOtp();
    const hashedOtp = AuthService.hashOtp(user.id, otp);

    await PrismaService.client.emailVerification.create({
      data: {
        userId: user.id,
        token: hashedOtp,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        attempts: 0,
      },
    });

    await emailService.sendVerificationOtp(email, user.name || 'there', otp);

    return {
      success: true,
      message: 'A new verification code has been sent to your email.',
    };
  }

  /**
   * 4. Local Login
   */
  public static async loginLocal(input: LoginInput): Promise<AuthResponse> {
    const email = input.email.trim().toLowerCase();

    const user = await PrismaService.client.user.findUnique({
      where: { email },
      include: {
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { balanceAfter: true },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw AppError.unauthorized('Invalid email or password');
    }

    const isValidPassword = await comparePassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw AppError.unauthorized('Invalid email or password');
    }

    // Email verification check
    if (!user.emailVerified || user.accountStatus === 'PENDING_VERIFICATION') {
      throw new AppError(
        'Please verify your email address to continue',
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        { email: user.email, requiresVerification: true }
      );
    }

    // Account status check
    if (user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
      throw new AppError(
        'Your account has been suspended or deactivated. Please contact support.',
        403,
        ERROR_CODES.ACCOUNT_SUSPENDED
      );
    }

    const creditBalance = user.creditLedgerEntries[0]?.balanceAfter ?? 0;

    const accessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = generateRefreshToken({ sub: user.id });

    return {
      tokens: { accessToken, refreshToken },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerified,
        creditBalance,
      },
    };
  }

  /**
   * 5. Google OAuth Authentication
   */
  public static async loginWithGoogle(input: GoogleAuthInput): Promise<AuthResponse> {
    const googleUser = await GoogleAuthService.verifyGoogleIdToken(input.credential);
    const email = googleUser.email.toLowerCase().trim();

    // Check if user already exists
    let user = await PrismaService.client.user.findFirst({
      where: {
        OR: [
          { email },
          {
            oauthAccounts: {
              some: {
                provider: 'google',
                providerAccountId: googleUser.sub,
              },
            },
          },
        ],
      },
      include: {
        oauthAccounts: true,
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { balanceAfter: true },
        },
      },
    });

    if (user) {
      // Account exists: link Google OAuth account if not linked
      const hasGoogleLinked = user.oauthAccounts.some(
        (acc) => acc.provider === 'google' && acc.providerAccountId === googleUser.sub
      );

      if (!hasGoogleLinked) {
        await PrismaService.client.oAuthAccount.create({
          data: {
            userId: user.id,
            provider: 'google',
            providerAccountId: googleUser.sub,
            email: googleUser.email,
            profilePicture: googleUser.picture,
          },
        });
      }

      // If existing local user was unverified, mark verified because Google verified it
      const updates: Record<string, unknown> = {};
      if (!user.emailVerified) {
        updates.emailVerified = true;
        updates.emailVerifiedAt = new Date();
        updates.accountStatus = 'ACTIVE';
      }
      if (!user.avatarUrl && googleUser.picture) {
        updates.avatarUrl = googleUser.picture;
      }
      if (!user.name && googleUser.name) {
        updates.name = googleUser.name;
      }

      if (Object.keys(updates).length > 0) {
        user = await PrismaService.client.user.update({
          where: { id: user.id },
          data: updates,
          include: {
            oauthAccounts: true,
            creditLedgerEntries: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { balanceAfter: true },
            },
          },
        });
      }

      if (user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
        throw new AppError(
          'Your account has been suspended or deactivated. Please contact support.',
          403,
          ERROR_CODES.ACCOUNT_SUSPENDED
        );
      }

      const creditBalance = await AuthService.grantWelcomeCredits(user.id);

      const accessToken = generateAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role,
      });
      const refreshToken = generateRefreshToken({ sub: user.id });

      return {
        tokens: { accessToken, refreshToken },
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatarUrl: user.avatarUrl,
          emailVerified: true,
          creditBalance,
        },
      };
    }

    // New Google registration
    const newUser = await PrismaService.client.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          name: googleUser.name,
          avatarUrl: googleUser.picture,
          authProvider: 'GOOGLE',
          accountStatus: 'ACTIVE',
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.userProfile.create({
        data: {
          userId: createdUser.id,
        },
      });

      await tx.userNotificationPreferences.create({
        data: {
          userId: createdUser.id,
        },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: createdUser.id,
          provider: 'google',
          providerAccountId: googleUser.sub,
          email: googleUser.email,
          profilePicture: googleUser.picture,
        },
      });

      return createdUser;
    });

    const creditBalance = await AuthService.grantWelcomeCredits(newUser.id);

    const accessToken = generateAccessToken({
      sub: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });
    const refreshToken = generateRefreshToken({ sub: newUser.id });

    // Send welcome email and in-app notification
    emailService.sendWelcomeNotification(newUser.email, newUser.name || 'there').catch(() => {});
    NotificationService.createNotification(newUser.id, {
      type: NotificationType.SYSTEM,
      title: 'Welcome to AI Vision Studio',
      message: 'Your Google account is connected. 100 starter credits have been deposited into your balance.',
      actionUrl: '/dashboard',
    }).catch(() => {});

    return {
      tokens: { accessToken, refreshToken },
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        avatarUrl: newUser.avatarUrl,
        emailVerified: true,
        creditBalance,
      },
    };
  }

  /**
   * 6. Forgot Password
   */
  public static async forgotPassword(input: ForgotPasswordInput): Promise<{
    success: boolean;
    message: string;
  }> {
    const email = input.email.trim().toLowerCase();

    const user = await PrismaService.client.user.findUnique({
      where: { email },
    });

    // Do not reveal whether user exists
    if (!user) {
      return {
        success: true,
        message: 'If an account exists with this email, a password reset link has been sent.',
      };
    }

    // Invalidate existing reset tokens
    await PrismaService.client.passwordReset.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    // Generate secure random reset token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = AuthService.hashToken(rawToken);

    await PrismaService.client.passwordReset.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const resetLink = `${env.CLIENT_URL}/reset-password?token=${rawToken}`;
    await emailService.sendPasswordResetLink(email, user.name || 'there', resetLink);

    return {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    };
  }

  /**
   * 7. Reset Password
   */
  public static async resetPassword(input: ResetPasswordInput): Promise<{
    success: boolean;
    message: string;
  }> {
    const hashedToken = AuthService.hashToken(input.token.trim());

    const resetRecord = await PrismaService.client.passwordReset.findFirst({
      where: {
        token: hashedToken,
        consumedAt: null,
      },
      include: { user: true },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date()) {
      throw AppError.badRequest('Invalid or expired password reset link. Please request a new one.');
    }

    const passwordHash = await hashPassword(input.newPassword);

    await PrismaService.client.$transaction([
      PrismaService.client.user.update({
        where: { id: resetRecord.userId },
        data: {
          passwordHash,
          authProvider: resetRecord.user.authProvider === 'GOOGLE' ? 'LOCAL' : resetRecord.user.authProvider,
          updatedAt: new Date(),
        },
      }),
      PrismaService.client.passwordReset.update({
        where: { id: resetRecord.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    // Send security alert email & in-app notification
    emailService
      .sendPasswordChangedAlert(resetRecord.user.email, resetRecord.user.name || 'there')
      .catch(() => {});

    NotificationService.createNotification(resetRecord.userId, {
      type: NotificationType.SECURITY,
      title: 'Password Changed',
      message: 'Your account password was successfully updated.',
      actionUrl: '/profile',
    }).catch(() => {});

    return {
      success: true,
      message: 'Password has been successfully reset. You can now log in with your new password.',
    };
  }

  /**
   * 8. Refresh Token
   */
  public static async refreshToken(token?: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (!token) {
      throw AppError.unauthorized('Refresh token is required');
    }

    const payload = verifyRefreshToken<{ sub: string }>(token);

    const user = await PrismaService.client.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.accountStatus === 'SUSPENDED' || user.accountStatus === 'DEACTIVATED') {
      throw AppError.unauthorized('Session has expired or account is suspended');
    }

    const accessToken = generateAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const newRefreshToken = generateRefreshToken({ sub: user.id });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * 9. Get Current User Details
   */
  public static async getCurrentUser(userId: string) {
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
        createdAt: true,
        profile: {
          select: {
            headline: true,
            bio: true,
            company: true,
            location: true,
            timezone: true,
            preferredLanguage: true,
            theme: true,
          },
        },
        creditLedgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { balanceAfter: true },
        },
        subscription: {
          select: {
            status: true,
            billingInterval: true,
            currentPeriodEnd: true,
            cancelAtPeriodEnd: true,
            plan: {
              select: {
                id: true,
                name: true,
                tier: true,
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
      createdAt: user.createdAt,
      profile: user.profile,
      creditBalance,
      subscription: user.subscription,
    };
  }
}
