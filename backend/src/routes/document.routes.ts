import { Router } from 'express';
import { uploadDocument, getDocuments, getDocumentById, deleteDocument } from '../controllers/document.controller';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', getDocuments);
router.get('/:id', getDocumentById);
router.delete('/:id', deleteDocument);

export default router;
