import { Request, Response, NextFunction } from 'express';
import { MemoryService } from '../services/memory.service.js';
import { sendSuccess } from '../utils/response.js';
import {
  CreateMemoryInput,
  UpdateMemoryInput,
  ListMemoriesQuery,
  GenerateMemoriesInput,
  ClearMemoriesInput,
} from '../validators/memory.validator.js';

export class MemoryController {
  /**
   * GET /api/v1/sessions/:id/memories
   * List all persisted memories for the session with category metrics
   */
  public static async listMemories(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessionId = req.params.id;
      const query = req.query as unknown as ListMemoriesQuery;

      const result = await MemoryService.listMemories(userId, sessionId, query);
      return sendSuccess(res, result, 'Session memories retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sessions/:id/memories
   * Manually create a new memory or observation
   */
  public static async createMemory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessionId = req.params.id;
      const input = req.body as CreateMemoryInput;

      const result = await MemoryService.createMemory(userId, sessionId, input);
      return sendSuccess(
        res,
        result,
        result.isDuplicateUpdated
          ? 'Existing duplicate memory updated'
          : 'Session memory created successfully',
        result.isDuplicateUpdated ? 200 : 201
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/sessions/:id/memories/:memoryId
   * Update memory item content, title, importance, or pin status
   */
  public static async updateMemory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { id: sessionId, memoryId } = req.params;
      const input = req.body as UpdateMemoryInput;

      const updated = await MemoryService.updateMemory(userId, sessionId, memoryId, input);
      return sendSuccess(res, updated, 'Memory item updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/sessions/:id/memories/:memoryId
   * Delete a single memory item
   */
  public static async deleteMemory(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { id: sessionId, memoryId } = req.params;

      const result = await MemoryService.deleteMemory(userId, sessionId, memoryId);
      return sendSuccess(res, result, 'Memory item deleted successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sessions/:id/memories/:memoryId/pin
   * Toggle or set pin status on a memory item
   */
  public static async togglePin(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const { id: sessionId, memoryId } = req.params;
      const isPinned = req.body.isPinned !== undefined ? Boolean(req.body.isPinned) : undefined;

      const updated = await MemoryService.togglePin(userId, sessionId, memoryId, isPinned);
      return sendSuccess(
        res,
        updated,
        updated.isPinned ? 'Memory pinned successfully' : 'Memory unpinned successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /api/v1/sessions/:id/memories
   * Clear memories (unpinned by default, or all if onlyUnpinned=false)
   */
  public static async clearMemories(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessionId = req.params.id;
      const { onlyUnpinned } = (req.body || {}) as ClearMemoriesInput;

      const result = await MemoryService.clearMemories(
        userId,
        sessionId,
        onlyUnpinned !== undefined ? onlyUnpinned : true
      );
      return sendSuccess(res, result, 'Session memories cleared successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/sessions/:id/memories/generate
   * Trigger AI memory extraction, context compression & rolling summary generation
   */
  public static async generateMemories(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessionId = req.params.id;
      const { forceRegenerate } = (req.body || {}) as GenerateMemoriesInput;

      const result = await MemoryService.generateMemories(userId, sessionId, forceRegenerate);
      return sendSuccess(res, result, 'Session memories generated and synthesized successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/sessions/:id/memories/context
   * Retrieve compressed context envelope for continuity or prompt injection
   */
  public static async getContextEnvelope(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = (req as any).user.id;
      const sessionId = req.params.id;

      const envelope = await MemoryService.getContextEnvelope(userId, sessionId);
      return sendSuccess(res, envelope, 'Memory context envelope retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}
