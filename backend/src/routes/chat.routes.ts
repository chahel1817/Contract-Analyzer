import { Router } from 'express';
import { sendMessage, getChatHistory } from '../controllers/chat.controller';

const router = Router();

router.post('/message', sendMessage);
router.get('/history/:documentId', getChatHistory);

export default router;
