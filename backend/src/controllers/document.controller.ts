import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { documentService } from '../services/document.service';
import { extractionService } from '../services/extraction.service';
import { retrievalService } from '../services/retrieval.service';
import { chunkingService } from '../services/chunking.service';

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please upload a PDF or DOCX file.',
      });
    }

    const { originalname, size, mimetype, path: filePath } = req.file;
    const defaultTitle = originalname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    // 1. Initial Document Record created with status: PROCESSING
    const document = await documentService.createDocument({
      title: defaultTitle,
      fileName: originalname,
      fileType: mimetype || 'application/octet-stream',
      fileSize: size,
      filePath: filePath,
      status: 'PROCESSING',
    });

    // 2. Extract text (PDF or DOCX)
    let extractionResult;
    try {
      extractionResult = await extractionService.extractText(filePath, originalname);
    } catch (extractErr: any) {
      await documentService.updateDocument(document.id, {
        status: 'FAILED',
        errorMessage: extractErr.message || 'Text extraction failed',
      });

      return res.status(422).json({
        success: false,
        error: extractErr.message || 'Text extraction failed.',
        data: {
          id: document.id,
          fileName: document.fileName,
          status: 'FAILED',
          errorMessage: extractErr.message || 'Text extraction failed',
        },
      });
    }

    // 3. Handle Scanned PDFs (no readable text -> FAILED)
    if (extractionResult.isScanned || !extractionResult.text || extractionResult.text.trim().length === 0) {
      const scannedMsg = 'The document appears to be a scanned image or contains no readable text. OCR is required.';
      await documentService.updateDocument(document.id, {
        status: 'FAILED',
        errorMessage: scannedMsg,
        pageCount: extractionResult.pageCount || 1,
      });

      return res.status(422).json({
        success: false,
        error: scannedMsg,
        data: {
          id: document.id,
          fileName: document.fileName,
          status: 'FAILED',
          errorMessage: scannedMsg,
        },
      });
    }

    // 4. Chunk & Index for Retrieval
    const chunkCount = await chunkingService.processAndStoreChunks(document.id, extractionResult.text);

    // 5. Update Document status to READY
    const updatedDoc = await documentService.updateDocument(document.id, {
      status: 'READY',
      extractedText: extractionResult.text,
      pageCount: extractionResult.pageCount,
      errorMessage: undefined,
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded and processed successfully.',
      data: {
        id: updatedDoc.id,
        title: updatedDoc.title,
        fileName: updatedDoc.fileName,
        fileType: updatedDoc.fileType,
        fileSize: updatedDoc.fileSize,
        pageCount: updatedDoc.pageCount,
        status: updatedDoc.status,
        chunkCount,
        createdAt: updatedDoc.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getDocuments = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const documents = await documentService.getAllDocuments();
    return res.status(200).json({
      success: true,
      count: documents.length,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Document ID is required.' });
    }

    const document = await documentService.getDocumentById(id);
    if (!document) {
      return res.status(404).json({
        success: false,
        error: `Document with ID "${id}" was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Document ID is required.' });
    }

    const deleted = await documentService.deleteDocument(id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: `Document with ID "${id}" was not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Document and its associated chunks and history deleted successfully.',
      id,
    });
  } catch (error) {
    next(error);
  }
};

export const getDocumentFile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ success: false, error: 'Document ID is required.' });
    }

    const document = await documentService.getDocumentById(id);
    if (!document) {
      return res.status(404).json({ success: false, error: `Document with ID "${id}" was not found.` });
    }

    const fullPath = path.isAbsolute(document.filePath)
      ? document.filePath
      : path.join(process.cwd(), document.filePath);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ success: false, error: 'Physical document file not found on disk.' });
    }

    const isPdf = document.fileName.toLowerCase().endsWith('.pdf');
    const contentType = isPdf ? 'application/pdf' : 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${document.fileName}"`);
    return res.sendFile(fullPath);
  } catch (error) {
    next(error);
  }
};
