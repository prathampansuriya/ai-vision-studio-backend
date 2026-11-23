import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { sendSuccess } from '../utils/response.js';
import { AppError } from '../utils/appError.js';

export class DashboardController {
  /**
   * GET /api/v1/dashboard/summary
   * Returns aggregated real database metrics, credit consumption, KPIs, and recent activity.
   */
  public static async getSummary(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user?.id) {
        throw AppError.unauthorized('Authentication required to access dashboard metrics');
      }

      const summary = await DashboardService.getDashboardSummary(req.user.id);
      sendSuccess(res, summary, 'Dashboard summary retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}
