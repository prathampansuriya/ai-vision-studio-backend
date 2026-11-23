import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { env } from '../config/index.js';
import { AppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export class GoogleAuthService {
  private static client: OAuth2Client | null = null;

  private static getClient(): OAuth2Client {
    if (!GoogleAuthService.client) {
      GoogleAuthService.client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    }
    return GoogleAuthService.client;
  }

  public static async verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleUser> {
    if (!idToken || typeof idToken !== 'string') {
      throw AppError.badRequest('Google ID token is required');
    }

    // Support deterministic testing in non-production environments
    if (env.NODE_ENV !== 'production' && idToken.startsWith('mock-google-token:')) {
      const parts = idToken.split(':');
      const email = parts[1] || 'googleuser@example.com';
      const name = parts[2] || 'Google User';
      const sub = parts[3] || 'google-sub-123456';
      const verified = parts[4] !== 'unverified';

      if (!verified) {
        throw AppError.badRequest('Google account email is not verified');
      }

      return {
        sub,
        email: email.toLowerCase().trim(),
        name,
        picture: 'https://lh3.googleusercontent.com/a/default-user',
        emailVerified: true,
      };
    }

    try {
      const client = GoogleAuthService.getClient();
      const ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID || undefined,
      });

      const payload: TokenPayload | undefined = ticket.getPayload();

      if (!payload) {
        throw AppError.unauthorized('Invalid Google credential token');
      }

      if (!payload.email) {
        throw AppError.badRequest('Google account does not provide an email address');
      }

      if (!payload.email_verified) {
        throw AppError.badRequest('Google account email is not verified by Google');
      }

      return {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name || payload.email.split('@')[0],
        picture: payload.picture,
        emailVerified: payload.email_verified,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Google token verification failed:', error);
      throw AppError.unauthorized('Google authentication failed: token is invalid or expired');
    }
  }
}
