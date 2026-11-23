import { Router } from 'express';
import { DocsController } from '../controllers/docs.controller.js';

const router = Router();

// Developer API Documentation HTML Explorer
router.get('/', DocsController.getDocsHtml);

// Machine-readable OpenAPI 3.1 Specification
router.get('/spec', DocsController.getDocsJson);
router.get('/json', DocsController.getDocsJson);

export const docsRoutes = router;
