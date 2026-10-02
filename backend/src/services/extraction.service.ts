import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
const pdfParse = require('pdf-parse');

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata?: Record<string, any>;
}

export class ExtractionService {
  async extractText(filePath: string, originalName: string): Promise<ExtractionResult> {
    const ext = path.extname(originalName).toLowerCase();
    const fileBuffer = await fs.readFile(filePath);

    if (ext === '.pdf') {
      const data = await pdfParse(fileBuffer);
      return {
        text: data.text || '',
        pageCount: data.numpages || 1,
        metadata: {
          info: data.info,
          version: data.version,
        },
      };
    }

    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return {
        text: result.value || '',
        metadata: {
          messages: result.messages,
        },
      };
    }

    // Default to plain text
    return {
      text: fileBuffer.toString('utf-8'),
    };
  }
}

export const extractionService = new ExtractionService();
