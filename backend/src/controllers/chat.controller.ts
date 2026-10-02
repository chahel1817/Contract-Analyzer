import { Request, Response, NextFunction } from 'express';
import { retrievalService } from '../services/retrieval.service';

export const searchDocumentChunks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentId, query, limit } = req.body;

    if (!documentId) {
      return res.status(400).json({ success: false, error: 'documentId is required' });
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const chunks = await retrievalService.searchDocument(
      query.trim(),
      documentId,
      limit ? Number(limit) : 5
    );

    return res.status(200).json({
      success: true,
      query,
      count: chunks.length,
      data: chunks,
    });
  } catch (error) {
    next(error);
  }
};

export const sendMessage = async (req: Request, res: Response, _next: NextFunction) => {
  res.json({ message: 'sendMessage placeholder' });
};

export const getChatHistory = async (req: Request, res: Response, _next: NextFunction) => {
  res.json({ message: 'getChatHistory placeholder' });
};
