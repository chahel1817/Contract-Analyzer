import { Request, Response } from 'express';

export const uploadDocument = async (req: Request, res: Response) => {
  res.json({ message: 'uploadDocument placeholder' });
};

export const getDocuments = async (req: Request, res: Response) => {
  res.json({ message: 'getDocuments placeholder' });
};

export const getDocumentById = async (req: Request, res: Response) => {
  res.json({ message: 'getDocumentById placeholder' });
};

export const deleteDocument = async (req: Request, res: Response) => {
  res.json({ message: 'deleteDocument placeholder' });
};
