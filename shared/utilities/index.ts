/**
 * Backend Shared Utilities
 * AI Vision Studio
 */

export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  keysToMask: string[] = ['password', 'secret', 'token', 'key']
): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    if (keysToMask.some((masked) => key.toLowerCase().includes(masked))) {
      result[key as keyof T] = '***REDACTED***' as unknown as T[keyof T];
    }
  }
  return result;
}

export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}d ${h}h ${m}m ${s}s`;
}
