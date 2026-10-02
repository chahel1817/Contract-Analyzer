import { Router } from 'express';
import { compareDocuments, getComparisonHistory } from '../controllers/comparison.controller';

const router = Router();

// POST /api/comparison
router.post('/', compareDocuments);

// POST /api/comparison/compare
router.post('/compare', compareDocuments);

// GET /api/comparison/history
router.get('/history', getComparisonHistory);

export default router;
