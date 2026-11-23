import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/session.service.js';
import { sendSuccess, sendPaginated } from '../utils/response.js';
import { CreateSessionInput, ListSessionsInput, UpdateSessionControlsInput } from '../validators/session.validator.js';
import { SwitchSessionModeInput } from '../validators/preset.validator.js';

export class SessionController {
  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = req.body as CreateSessionInput;
      const result = await SessionService.createSession(userId, input);

      return sendSuccess(
        res,
        result,
        'Live multimodal session created successfully',
        201
      );
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const session = await SessionService.getSessionDetails(userId, sessionId);

      return sendSuccess(res, session, 'Session retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const updated = await SessionService.updateSession(userId, sessionId, req.body);

      return sendSuccess(res, updated, 'Session updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const result = await SessionService.deleteSession(userId, sessionId);

      return sendSuccess(res, result, 'Session deleted successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async continue(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const continued = await SessionService.continueSession(userId, sessionId, req.body);

      return sendSuccess(res, continued, 'New session initialized with restored context', 201);
    } catch (error) {
      next(error);
    }
  }

  public static async export(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const format = (req.query.format as 'txt' | 'md' | 'json') || 'txt';
      const speaker = req.query.speaker as any;

      const exportResult = await SessionService.exportTranscript(userId, sessionId, format, speaker);

      res.setHeader('Content-Type', exportResult.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportResult.filename}"`);
      return res.status(200).send(exportResult.content);
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = (req.query as unknown) as ListSessionsInput;
      const result = await SessionService.listSessions(userId, query);

      return sendPaginated(
        res,
        result.sessions,
        result.total,
        result.page,
        result.limit,
        'Sessions listed successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  public static async generateToken(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const session = await SessionService.getSessionById(userId, sessionId);
      const tokenResult = SessionService.generateSessionToken(userId, session.id);

      return sendSuccess(
        res,
        tokenResult,
        'Session WebSocket access ticket generated successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  public static async end(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const { toolExecutions } = req.body || {};
      const endedSession = await SessionService.endSession(userId, sessionId, toolExecutions);

      return sendSuccess(
        res,
        endedSession,
        'Live session ended and settled successfully'
      );
    } catch (error) {
      next(error);
    }
  }

  public static async switchMode(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const input = req.body as SwitchSessionModeInput;
      const result = await SessionService.switchMode(userId, sessionId, input);

      return sendSuccess(
        res,
        result,
        `Session mode shifted to ${input.mode} successfully`
      );
    } catch (error) {
      next(error);
    }
  }

  public static async updateControls(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const input = req.body as UpdateSessionControlsInput;
      const result = await SessionService.updateControls(userId, sessionId, input);

      return sendSuccess(res, result, 'Session controls updated successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async resetContext(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const result = await SessionService.resetContext(userId, sessionId);

      return sendSuccess(res, result, 'Session context reset successfully');
    } catch (error) {
      next(error);
    }
  }

  public static async interrupt(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const sessionId = req.params.id as string;
      const result = await SessionService.interrupt(userId, sessionId);

      return sendSuccess(res, result, 'AI turn interrupted successfully');
    } catch (error) {
      next(error);
    }
  }
}
