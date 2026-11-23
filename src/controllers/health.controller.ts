import { Request, Response, NextFunction } from 'express';
import { HealthService } from '../services/health.service.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { HTTP_STATUS, ERROR_CODES } from '@shared/constants/index.js';

export class HealthController {
  public static async getHealth(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const health = await HealthService.getSystemHealth();
      const statusCode = health.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json({
        success: health.status === 'healthy',
        data: health,
        meta: {
          timestamp: health.timestamp,
          requestId: _req.id,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getReadiness(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const readiness = await HealthService.checkDatabaseReadiness();
      if (!readiness.ready) {
        sendError(
          res,
          'Database readiness check failed',
          HTTP_STATUS.SERVICE_UNAVAILABLE,
          ERROR_CODES.SERVICE_UNAVAILABLE,
          readiness.error
        );
        return;
      }

      sendSuccess(res, {
        status: 'ready',
        database: 'connected',
        latencyMs: readiness.latencyMs,
      }, 'Service is ready to handle traffic');
    } catch (error) {
      next(error);
    }
  }

  public static getLiveness(_req: Request, res: Response): void {
    const liveness = HealthService.getLiveness();
    sendSuccess(res, liveness, 'Service is alive');
  }

  public static getPing(_req: Request, res: Response): void {
    sendSuccess(res, { ping: 'pong', timestamp: new Date().toISOString() });
  }
}
