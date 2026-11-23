import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller.js';
import { validateBody } from '../middleware/validate.js';
import { contactSchema } from '../validators/contact.validator.js';

const router = Router();

/**
 * @route   POST /api/v1/contact
 * @desc    Submit public support / contact inquiry
 * @access  Public
 */
router.post('/', validateBody(contactSchema), ContactController.submit);

export const contactRoutes = router;
