import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/index.js';
import { AppError } from './appError.js';
import { ERROR_CODES } from '../../shared/constants/index.js';

export function generateAccessToken(
  payload: Record<string, unknown>,
  expiresIn: string = env.JWT_EXPIRES_IN
): string {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken<T extends object = Record<string, unknown>>(token: string): T {
  try {
    return jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as T;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Access token has expired', 401, ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AppError('Invalid access token', 401, ERROR_CODES.INVALID_TOKEN);
  }
}

export function generateRefreshToken(
  payload: Record<string, unknown>,
  expiresIn: string = env.JWT_REFRESH_EXPIRES_IN
): string {
  const options: SignOptions = {
    expiresIn: expiresIn as SignOptions['expiresIn'],
    algorithm: 'HS256',
  };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, options);
}

export function verifyRefreshToken<T extends object = Record<string, unknown>>(token: string): T {
  try {
    return jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as T;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError('Refresh token has expired', 401, ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new AppError('Invalid refresh token', 401, ERROR_CODES.INVALID_TOKEN);
  }
}
