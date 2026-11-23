import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { TemplateController } from '../controllers/template.controller.js';
import { createTemplateSchema, updateTemplateSchema } from '../validators/template.validator.js';

const router = Router();

// List templates (system + user custom) with query filters
router.get('/', authenticate, TemplateController.list);

// Get template details
router.get('/:id', authenticate, TemplateController.getById);

// Create custom template
router.post('/', authenticate, validateBody(createTemplateSchema), TemplateController.create);

// Update custom template
router.put('/:id', authenticate, validateBody(updateTemplateSchema), TemplateController.update);
router.patch('/:id', authenticate, validateBody(updateTemplateSchema), TemplateController.update);

// Duplicate template (system or user-owned)
router.post('/:id/duplicate', authenticate, TemplateController.duplicate);

// Toggle favorite status
router.post('/:id/favorite', authenticate, TemplateController.toggleFavorite);

// Delete custom template
router.delete('/:id', authenticate, TemplateController.delete);

// Seed system templates
router.post('/system/seed', authenticate, TemplateController.seed);

export const templateRoutes = router;
