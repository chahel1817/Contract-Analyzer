import { Router } from 'express';
import {
  sendMessage,
  getConversationsByDocument,
  searchDocumentChunks,
  agentResearch,
} from '../controllers/chat.controller';

const router = Router();

// POST /api/chat/agent - Autonomous Agentic Document Research
router.post('/agent', agentResearch);

// POST /api/chat - Send message, retrieve chunks, query AI, verify quotes, store citations
router.post('/', sendMessage);
router.post('/message', sendMessage);

// POST /api/chat/search - Search chunks without AI
router.post('/search', searchDocumentChunks);

// GET /api/chat/history/:documentId - Get conversations and messages
router.get('/history/:documentId', getConversationsByDocument);
router.get('/conversations/:documentId', getConversationsByDocument);

export default router;
