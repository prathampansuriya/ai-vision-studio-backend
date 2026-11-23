import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';
import { SearchController } from '../controllers/search.controller.js';
import {
  globalSearchQuerySchema,
  searchSuggestionsQuerySchema,
} from '../validators/search.validator.js';

const router = Router();

// All search operations require user authentication
router.use(authenticate);

// Global multi-entity search
router.get('/', validateQuery(globalSearchQuerySchema), SearchController.search);

// Recent search history
router.get('/recent', SearchController.getRecent);
router.delete('/recent', SearchController.clearRecent);

// Auto-suggestions
router.get('/suggestions', validateQuery(searchSuggestionsQuerySchema), SearchController.getSuggestions);

export const searchRoutes = router;
