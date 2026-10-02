import { Router } from 'express';
import {
  sendMessage,
  getChatHistory,
  searchDocumentChunks,
} from '../controllers/chat.controller';

const router = Router();

// POST /api/chat/search - Search relevant chunks for a question (without LLM)
router.post('/search', searchDocumentChunks);

// POST /api/chat/message - Send chat message
router.post('/message', sendMessage);

// GET /api/chat/history/:documentId - Get chat history for document
router.get('/history/:documentId', getChatHistory);

export default router;
