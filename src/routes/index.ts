import { Router } from 'express';
import { healthRoutes } from './health.routes.js';
import { authRoutes } from './auth.routes.js';
import { dashboardRoutes } from './dashboard.routes.js';
import { billingRoutes } from './billing.routes.js';
import { creditRoutes } from './credit.routes.js';
import { notificationRoutes } from './notification.routes.js';
import { userRoutes } from './user.routes.js';
import { uploadRoutes } from './upload.routes.js';
import { sessionRoutes } from './session.routes.js';
import { presetRoutes } from './preset.routes.js';
import { snapshotRoutes } from './snapshot.routes.js';
import { insightRoutes } from './insight.routes.js';
import { searchRoutes } from './search.routes.js';
import { templateRoutes } from './template.routes.js';
import { contactRoutes } from './contact.routes.js';
import { internalRoutes } from './internal.routes.js';

const apiRouter = Router();

// Health routes under /api/v1/health
apiRouter.use('/health', healthRoutes);

// Authentication routes under /api/v1/auth
apiRouter.use('/auth', authRoutes);

// Dashboard routes under /api/v1/dashboard
apiRouter.use('/dashboard', dashboardRoutes);

// Billing & Subscription routes under /api/v1/billing
apiRouter.use('/billing', billingRoutes);

// Credit Engine & Metering routes under /api/v1/credits
apiRouter.use('/credits', creditRoutes);

// Notification routes under /api/v1/notifications
apiRouter.use('/notifications', notificationRoutes);

// User Profile & Settings routes under /api/v1/user
apiRouter.use('/user', userRoutes);

// Cloudinary Media Upload routes under /api/v1/upload
apiRouter.use('/upload', uploadRoutes);

// Live Multimodal Sessions under /api/v1/sessions
apiRouter.use('/sessions', sessionRoutes);

// AI Modes & Session Presets under /api/v1/presets
apiRouter.use('/presets', presetRoutes);

// Snapshot Studio & Visual Frame Analysis under /api/v1/snapshots
apiRouter.use('/snapshots', snapshotRoutes);

// Knowledge Library & Saved Insights under /api/v1/insights
apiRouter.use('/insights', insightRoutes);

// Authenticated Global Search & History under /api/v1/search
apiRouter.use('/search', searchRoutes);

// Session Templates & Saved Workflows under /api/v1/templates
apiRouter.use('/templates', templateRoutes);

// Public Contact & Support Inquiries under /api/v1/contact
apiRouter.use('/contact', contactRoutes);

// Internal Service-to-Service RPC under /api/v1/internal
apiRouter.use('/internal', internalRoutes);

export const rootRouter = apiRouter;
