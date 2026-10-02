import { Request, Response } from 'express';

export const sendMessage = async (req: Request, res: Response) => {
  res.json({ message: 'sendMessage placeholder' });
};

export const getChatHistory = async (req: Request, res: Response) => {
  res.json({ message: 'getChatHistory placeholder' });
};
