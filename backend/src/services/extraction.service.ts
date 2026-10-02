import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
const { PDFParse } = require('pdf-parse');

export interface ExtractionResult {
  text: string;
  pageCount: number;
  isScanned: boolean;
  pages?: { pageNumber: number; text: string }[];
  metadata?: Record<string, any>;
}

export class ExtractionService {
  async extractText(filePath: string, originalName: string): Promise<ExtractionResult> {
    const ext = path.extname(originalName).toLowerCase();
    const fileBuffer = await fs.readFile(filePath);

    if (ext === '.pdf') {
      const parser = new PDFParse(new Uint8Array(fileBuffer));
      await parser.load();
      const parsed = await parser.getText();
      
      const rawText = parsed.text || '';
      const totalPages = parsed.total || (parsed.pages && parsed.pages.length) || 1;
      
      // Map individual pages
      const pageList: { pageNumber: number; text: string }[] = [];
      let combinedWithMarkers = '';

      if (parsed.pages && Array.isArray(parsed.pages)) {
        for (const p of parsed.pages) {
          const pageNum = p.num || pageList.length + 1;
          const pageStr = p.text || '';
          pageList.push({ pageNumber: pageNum, text: pageStr });
          combinedWithMarkers += `\n[[PAGE_${pageNum}]]\n${pageStr}`;
        }
      } else {
        combinedWithMarkers = rawText;
      }

      const cleanText = rawText.replace(/-- \d+ of \d+ --/g, '').replace(/\[\[PAGE_\d+\]\]/g, '').trim();
      const isScanned = cleanText.length < 15;

      if (parser.destroy) {
        try { await parser.destroy(); } catch {}
      }

      return {
        text: combinedWithMarkers,
        pageCount: totalPages,
        isScanned,
        pages: pageList,
      };
    }

    if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      const text = result.value || '';
      const isScanned = text.trim().length === 0;
      const estimatedPages = Math.max(1, Math.ceil(text.length / 2500));

      return {
        text,
        pageCount: estimatedPages,
        isScanned,
        metadata: {
          messages: result.messages,
        },
      };
    }

    throw new Error(`Unsupported file type: ${ext}. Only PDF and DOCX files are allowed.`);
  }
}

export const extractionService = new ExtractionService();
