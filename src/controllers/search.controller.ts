import { Request, Response, NextFunction } from 'express';
import { SearchService } from '../services/search.service.js';
import { sendSuccess } from '../utils/response.js';
import {
  GlobalSearchQuery,
  SearchSuggestionsQuery,
} from '../validators/search.validator.js';

export class SearchController {
  /**
   * GET /api/v1/search
   * Execute global search across sessions, transcripts, insights, reports, snapshots, memories
   */
  public static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const query = req.query as unknown as GlobalSearchQuery;
      const result = await SearchService.search(userId, query);
      return sendSuccess(res, result, 'Search completed successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/search/recent
   * Get user's recent search terms
   */
  public static async getRecent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 8;
      const result = await SearchService.getRecentSearches(userId, limit);
      return sendSuccess(res, result, 'Recent searches retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/search/recent
   * Clear user's recent searches (all, or single item via ?id=...)
   */
  public static async clearRecent(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const id = req.query.id as string | undefined;
      const result = await SearchService.clearRecentSearches(userId, id);
      return sendSuccess(res, result, 'Recent searches cleared successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/search/suggestions
   * Get fast query auto-suggestions
   */
  public static async getSuggestions(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const query = (req.query.q as string) || '';
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5;
      const result = await SearchService.getSuggestions(userId, query, limit);
      return sendSuccess(res, result, 'Search suggestions retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}
