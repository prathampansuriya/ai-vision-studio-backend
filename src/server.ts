import http from 'http';
import { createApp } from './app.js';
import { env } from './config/index.js';
import { logger } from './utils/logger.js';
import { PrismaService } from './services/prisma.service.js';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  server.listen(env.PORT, env.SERVER_HOST, () => {
    logger.info(`🚀 AI Vision Studio backend running at http://${env.SERVER_HOST}:${env.PORT}`);
    logger.info(`🔍 Environment: ${env.NODE_ENV}`);
    logger.info(`⚡ Health check available at: http://${env.SERVER_HOST}:${env.PORT}/api/v1/health`);
    logger.info(`📚 API Documentation available at: http://${env.SERVER_HOST}:${env.PORT}/api/docs`);
    logger.info(`🤖 AI Service configured at: ${env.AI_SERVICE_URL}`);
  });

  // Graceful shutdown handling
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server:', err);
      } else {
        logger.info('HTTP server closed successfully.');
      }

      try {
        // Disconnect database client
        await PrismaService.disconnect();
        logger.info('Database connections closed cleanly.');
      } catch (dbErr) {
        logger.error('Error disconnecting database during shutdown:', dbErr);
      }

      logger.info('Process terminated gracefully.');
      process.exit(0);
    });

    // Force close after 10 seconds if shutdown hangs
    setTimeout(() => {
      logger.error('Forced shutdown due to timeout.');
      process.exit(1);
    }, 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((error) => {
  logger.error('Fatal bootstrap error:', error);
  process.exit(1);
});
