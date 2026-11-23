import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { PresetController } from '../controllers/preset.controller.js';
import { createPresetSchema, updatePresetSchema } from '../validators/preset.validator.js';

const router = Router();

// Presets can be listed by anyone, but user context includes their custom presets
router.get('/', authenticate, PresetController.list);
router.get('/:id', authenticate, PresetController.getById);

// Preset creation, modification, deletion requires authenticated user
router.post('/', authenticate, validateBody(createPresetSchema), PresetController.create);
router.put('/:id', authenticate, validateBody(updatePresetSchema), PresetController.update);
router.delete('/:id', authenticate, PresetController.delete);

export const presetRoutes = router;
