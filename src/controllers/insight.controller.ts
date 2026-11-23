import { Request, Response, NextFunction } from 'express';
import { InsightService } from '../services/insight.service.js';
import { sendSuccess } from '../utils/response.js';
import {
  CreateInsightInput,
  UpdateInsightInput,
  ListInsightsQuery,
} from '../validators/insight.validator.js';

export class InsightController {
  /**
   * GET /api/v1/insights
   * List saved insights with filtering and pagination
   */
  public static async listInsights(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const query = req.query as unknown as ListInsightsQuery;
      const result = await InsightService.listInsights(userId, query);
      return sendSuccess(res, result, 'Saved insights retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/insights
   * Create a new saved insight
   */
  public static async createInsight(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const input = req.body as CreateInsightInput;
      const result = await InsightService.createInsight(userId, input);
      return sendSuccess(res, result, 'Insight saved successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/stats
   * Get statistics and category counts for user insights
   */
  public static async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const result = await InsightService.getInsightStats(userId);
      return sendSuccess(res, result, 'Insight statistics retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/insights/:id
   * Get a single saved insight by ID
   */
  public static async getInsight(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const id = req.params.id;
      const result = await InsightService.getInsight(userId, id);
      return sendSuccess(res, result, 'Saved insight retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/insights/:id
   * Update a saved insight
   */
  public static async updateInsight(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const id = req.params.id;
      const input = req.body as UpdateInsightInput;
      const result = await InsightService.updateInsight(userId, id, input);
      return sendSuccess(res, result, 'Saved insight updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/insights/:id
   * Delete a saved insight
   */
  public static async deleteInsight(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const id = req.params.id;
      const result = await InsightService.deleteInsight(userId, id);
      return sendSuccess(res, result, 'Saved insight deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}
