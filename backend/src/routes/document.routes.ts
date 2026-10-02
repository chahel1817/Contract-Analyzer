import { Router } from 'express';
import {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
} from '../controllers/document.controller';
import { handleUpload } from '../middleware/upload.middleware';

const router = Router();

// POST /api/documents/upload - Upload and process PDF/DOCX
router.post('/upload', handleUpload, uploadDocument);

// GET /api/documents - List all documents
router.get('/', getDocuments);

// GET /api/documents/:id - Get document details with chunks
router.get('/:id', getDocumentById);

// DELETE /api/documents/:id - Delete document and cascading records
router.delete('/:id', deleteDocument);

export default router;
