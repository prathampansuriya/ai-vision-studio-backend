import { Request, Response, NextFunction } from 'express';
import { ReportService } from '../services/report.service.js';
import { sendSuccess } from '../utils/response.js';
import { GenerateReportInput, ExportReportQuery } from '../validators/report.validator.js';

export class ReportController {
  public static async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const report = await ReportService.getReport(userId, sessionId);

      return sendSuccess(res, report, 'Session intelligence report retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async generateReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const input = req.body as GenerateReportInput;
      const report = await ReportService.generateReport(userId, sessionId, input);

      return sendSuccess(res, report, 'Session intelligence report compiled successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async exportReport(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const query = (req.query as unknown) as ExportReportQuery;
      const format = query.format || 'markdown';

      const exportResult = await ReportService.exportReport(userId, sessionId, format);

      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      return res.status(200).send(exportResult.content);
    } catch (error) {
      next(error);
    }
  }
}
