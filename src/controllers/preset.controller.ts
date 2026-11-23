import { Request, Response, NextFunction } from 'express';
import { PresetService } from '../services/preset.service.js';
import { sendSuccess } from '../utils/response.js';
import { CreatePresetInput, UpdatePresetInput } from '../validators/preset.validator.js';

export class PresetController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const presets = await PresetService.listPresets(userId);
      return sendSuccess(res, presets, 'Session presets retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const presetId = req.params.id as string;
      const preset = await PresetService.getPresetById(presetId, userId);
      return sendSuccess(res, preset, 'Session preset retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = req.body as CreatePresetInput;
      const preset = await PresetService.createPreset(userId, input);
      return sendSuccess(res, preset, 'Session preset created successfully', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const presetId = req.params.id as string;
      const input = req.body as UpdatePresetInput;
      const preset = await PresetService.updatePreset(presetId, userId, input);
      return sendSuccess(res, preset, 'Session preset updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const presetId = req.params.id as string;
      const result = await PresetService.deletePreset(presetId, userId);
      return sendSuccess(res, result, 'Session preset deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}
