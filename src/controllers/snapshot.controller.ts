import { Request, Response, NextFunction } from 'express';
import { SnapshotService } from '../services/snapshot.service.js';
import { sendSuccess } from '../utils/response.js';
import { HTTP_STATUS } from '../../shared/constants/index.js';

export class SnapshotController {
  public static async capture(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snapshot = await SnapshotService.captureSnapshot(req.user!.id, req.body);
      sendSuccess(res, snapshot, 'Snapshot captured and saved successfully.', HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await SnapshotService.listSnapshots(req.user!.id, req.query as any);
      sendSuccess(res, result, 'Snapshots retrieved successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const snapshot = await SnapshotService.getSnapshotById(req.user!.id, req.params.id);
      sendSuccess(res, snapshot, 'Snapshot retrieved successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await SnapshotService.updateSnapshot(req.user!.id, req.params.id, req.body);
      sendSuccess(res, updated, 'Snapshot updated successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await SnapshotService.deleteSnapshot(req.user!.id, req.params.id);
      sendSuccess(res, result, 'Snapshot deleted successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async analyze(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prompt, focusArea } = req.body;
      const analyzed = await SnapshotService.analyzeSnapshot(req.user!.id, req.params.id, prompt, focusArea);
      sendSuccess(res, analyzed, 'Snapshot analyzed successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async askQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { question } = req.body;
      const answerEntry = await SnapshotService.askQuestion(req.user!.id, req.params.id, question);
      sendSuccess(res, answerEntry, 'Question answered successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }

  public static async compare(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const comparison = await SnapshotService.compareSnapshots(req.user!.id, req.body);
      sendSuccess(res, comparison, 'Snapshots compared successfully.', HTTP_STATUS.CREATED);
    } catch (error) {
      next(error);
    }
  }

  public static async listComparisons(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const comparisons = await SnapshotService.listComparisons(req.user!.id);
      sendSuccess(res, comparisons, 'Snapshot comparisons retrieved successfully.', HTTP_STATUS.OK);
    } catch (error) {
      next(error);
    }
  }
}
