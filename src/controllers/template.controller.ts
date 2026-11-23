import { Request, Response, NextFunction } from 'express';
import { TemplateService } from '../services/template.service.js';
import { sendSuccess } from '../utils/response.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  listTemplatesQuerySchema,
} from '../validators/template.validator.js';

export class TemplateController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || '';
      const query = listTemplatesQuerySchema.parse(req.query);
      const result = await TemplateService.listTemplates(userId, query);
      return sendSuccess(res, result, 'Session templates retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || '';
      const templateId = req.params.id as string;
      const template = await TemplateService.getTemplateById(userId, templateId);
      return sendSuccess(res, template, 'Session template retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = createTemplateSchema.parse(req.body);
      const template = await TemplateService.createTemplate(userId, input);
      return sendSuccess(res, template, 'Session template created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const templateId = req.params.id as string;
      const input = updateTemplateSchema.parse(req.body);
      const template = await TemplateService.updateTemplate(userId, templateId, input);
      return sendSuccess(res, template, 'Session template updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const templateId = req.params.id as string;
      const template = await TemplateService.duplicateTemplate(userId, templateId);
      return sendSuccess(res, template, 'Session template duplicated successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const templateId = req.params.id as string;
      const result = await TemplateService.deleteTemplate(userId, templateId);
      return sendSuccess(res, result, 'Session template deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async toggleFavorite(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id || '';
      const templateId = req.params.id as string;
      const result = await TemplateService.toggleFavorite(userId, templateId);
      return sendSuccess(res, result, 'Template favorite status updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async seed(req: Request, res: Response, next: NextFunction) {
    try {
      await TemplateService.seedSystemTemplates();
      return sendSuccess(res, { seeded: true }, 'System session templates seeded successfully');
    } catch (error) {
      next(error);
    }
  }
}
