import { Router } from 'express';
import { compareDocuments, getComparisonHistory } from '../controllers/comparison.controller';

const router = Router();

router.post('/compare', compareDocuments);
router.get('/history', getComparisonHistory);

export default router;
