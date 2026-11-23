import os from 'os';
import { env } from '../config/index.js';
import { PrismaService } from './prisma.service.js';
import { SystemHealthResponse, ServiceHealthStatus } from '../../shared/types/index.js';

export class HealthService {
  public static async getSystemHealth(): Promise<SystemHealthResponse> {
    const dbPing = await PrismaService.pingDatabase();
    const memory = process.memoryUsage();

    const isHealthy = dbPing.status === 'healthy';

    return {
      status: isHealthy ? 'healthy' : 'degraded',
      service: 'ai-vision-studio-server',
      version: '1.0.0',
      environment: env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        database: {
          status: dbPing.status,
          latencyMs: dbPing.latencyMs,
          ...(dbPing.error ? { message: 'Database connection check failed' } : {}),
        },
      },
      system: {
        nodeVersion: process.version,
        platform: os.platform(),
        memoryUsageMb: {
          rss: Math.round(memory.rss / (1024 * 1024)),
          heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
          heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
        },
      },
    };
  }

  public static async checkDatabaseReadiness(): Promise<{ ready: boolean; latencyMs?: number; error?: string }> {
    const dbPing = await PrismaService.pingDatabase();
    return {
      ready: dbPing.status === 'healthy',
      latencyMs: dbPing.latencyMs,
      error: dbPing.error,
    };
  }

  public static getLiveness(): { status: string; uptime: number; timestamp: string } {
    return {
      status: 'alive',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
