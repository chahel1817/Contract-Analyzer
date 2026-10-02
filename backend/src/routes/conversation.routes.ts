import { Router } from 'express';
import { getConversationsByDocument } from '../controllers/chat.controller';

const router = Router();

// GET /api/conversations/:documentId
router.get('/:documentId', getConversationsByDocument);

export default router;
