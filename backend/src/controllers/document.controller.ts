import { Request, Response, NextFunction } from 'express';
import { documentService } from '../services/document.service';
import { extractionService } from '../services/extraction.service';
import { retrievalService } from '../services/retrieval.service';
import fs from 'fs/promises';

export const uploadDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please provide a PDF or DOCX contract file.',
      });
    }

    const { originalname, size, mimetype, path: filePath } = req.file;

    // 1. Extract text and detect scanned/empty document
    let extractionResult;
    try {
      extractionResult = await extractionService.extractText(filePath, originalname);
    } catch (extractErr: any) {
      // Clean up file if extraction fails
      await fs.unlink(filePath).catch(() => {});
      return res.status(400).json({
        success: false,
        error: extractErr.message || 'Failed to extract text from document.',
      });
    }

    // Handle scanned PDF / empty text (Requirement: Part A #1)
    if (extractionResult.isScanned || !extractionResult.text || extractionResult.text.trim().length === 0) {
      await fs.unlink(filePath).catch(() => {});
      return res.status(422).json({
        success: false,
        error: 'The uploaded document appears to be a scanned image or contains no readable text. Please upload a searchable PDF or DOCX file.',
      });
    }

    // 2. Derive a clean title from file name
    const defaultTitle = originalname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');

    // 3. Save Document in database
    const document = await documentService.createDocument({
      title: defaultTitle,
      fileName: originalname,
      fileType: mimetype || 'application/octet-stream',
      fileSize: size,
      filePath: filePath,
      extractedText: extractionResult.text,
      pageCount: extractionResult.pageCount,
      status: 'processed',
    });

    // 4. Chunk and index document for fast retrieval
    const chunkCount = await retrievalService.indexDocument(document.id, extractionResult.text);

    return res.status(201).json({
      success: true,
      message: 'Document uploaded, extracted, and indexed successfully.',
      data: {
        id: document.id,
        title: document.title,
        fileName: document.fileName,
        fileType: document.fileType,
        fileSize: document.fileSize,
        pageCount: document.pageCount,
        status: document.status,
        chunkCount,
        createdAt: document.createdAt,
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
