import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/index.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { rootRouter } from './routes/index.js';
import { docsRoutes } from './routes/docs.routes.js';
import { HealthController } from './controllers/health.controller.js';

export function createApp(): Express {
  const app: Express = express();

  // 1. Request ID generator / propagator
  app.use(requestId);

  // 2. Security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy:
        env.NODE_ENV === 'production'
          ? {
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'", env.CLIENT_URL, env.AI_SERVICE_URL],
              },
            }
          : false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      xContentTypeOptions: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    })
  );

  // 3. CORS configuration
  const allowedOrigins = [
    env.CLIENT_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true); // Permissive in dev, or restricted per origin
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'X-Request-Id',
        'x-internal-key',
      ],
      exposedHeaders: ['X-Request-Id'],
    })
  );

  // 4. Secure signed cookie parser
  app.use(cookieParser(env.COOKIE_SECRET));

  // 5. Body parsers with limits and rawBody preservation for webhooks
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 6. Request logger
  app.use(requestLogger);

  // 7. Root status and health endpoints (unthrottled for monitoring)
  app.get('/health', HealthController.getHealth);
  app.get('/', (_req, res) => {
    res.json({
      name: 'AI Vision Studio API',
      tagline: 'See. Speak. Understand. In Real Time.',
      version: '1.0.0',
      docs: '/api/docs',
      health: '/api/v1/health',
      timestamp: new Date().toISOString(),
    });
  });

  // 8. API Documentation
  app.use('/api/docs', docsRoutes);

  // 9. API Rate limiting on all /api routes
  app.use('/api/', apiRateLimiter);

  // 10. API v1 router
  app.use('/api/v1', rootRouter);

  // 11. 404 handler
  app.use(notFoundHandler);

  // 12. Centralized error handler
  app.use(errorHandler);

  return app;
}
