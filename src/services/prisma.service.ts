import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { logger } from '../utils/logger.js';
import { env } from '../config/index.js';

class PrismaService {
  private static instance: PrismaClient;
  private static pool: pg.Pool;

  public static get client(): PrismaClient {
    return PrismaService.getInstance();
  }

  public static getInstance(): PrismaClient {
    if (!PrismaService.instance) {
      PrismaService.pool = new pg.Pool({
        connectionString: env.DATABASE_URL,
      });

      const adapter = new PrismaPg(PrismaService.pool);

      PrismaService.instance = new PrismaClient({
        adapter,
        log:
          env.NODE_ENV === 'development'
            ? [
                { emit: 'event', level: 'query' },
                { emit: 'stdout', level: 'info' },
                { emit: 'stdout', level: 'warn' },
                { emit: 'stdout', level: 'error' },
              ]
            : [{ emit: 'stdout', level: 'error' }],
      });

      if (env.NODE_ENV === 'development') {
        (PrismaService.instance as unknown as { $on: (event: string, callback: (e: unknown) => void) => void }).$on?.(
          'query',
          (e: unknown) => {
            logger.debug('Prisma Query', e);
          }
        );
      }
    }
    return PrismaService.instance;
  }

  public static async pingDatabase(): Promise<{ status: 'healthy' | 'down'; latencyMs: number; error?: string }> {
    const client = PrismaService.getInstance();
    const start = Date.now();
    try {
      await client.$queryRawUnsafe('SELECT 1');
      const latencyMs = Date.now() - start;
      return { status: 'healthy', latencyMs };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const errorMessage = err instanceof Error ? err.message : 'Unknown database error';
      logger.error('Database health ping failed', { error: errorMessage, latencyMs });
      return { status: 'down', latencyMs, error: errorMessage };
    }
  }

  public static async disconnect(): Promise<void> {
    if (PrismaService.instance) {
      await PrismaService.instance.$disconnect();
    }
    if (PrismaService.pool) {
      await PrismaService.pool.end();
    }
    logger.info('Database disconnected cleanly');
  }
}

export const prisma = PrismaService.getInstance();
export { PrismaService };
