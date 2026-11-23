import bcrypt from 'bcryptjs';
import { z } from 'zod';

const BCRYPT_SALT_ROUNDS = 12;

export const passwordComplexitySchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export async function hashPassword(plainTextPassword: string): Promise<string> {
  return bcrypt.hash(plainTextPassword, BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plainTextPassword: string, passwordHash: string): Promise<boolean> {
  if (!plainTextPassword || !passwordHash) return false;
  return bcrypt.compare(plainTextPassword, passwordHash);
}
