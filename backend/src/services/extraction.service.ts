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
  /**
   * Extract text and page information from a PDF file.
   * Handles multi-page agreements, detects corrupt PDFs, and detects scanned PDFs with no readable text.
   */
  async extractPDF(filePath: string): Promise<ExtractionResult> {
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (readErr: any) {
      throw new Error(`File read error: ${readErr.message || 'Unable to read file from disk.'}`);
    }

    // 1. Verify file size and header to catch Corrupt PDFs early
    if (fileBuffer.length < 15) {
      throw new Error('Corrupt PDF: The file is empty or too small to be a valid PDF document.');
    }

    const header = fileBuffer.slice(0, 5).toString('ascii');
    if (!header.startsWith('%PDF-')) {
      throw new Error('Corrupt PDF: Missing valid %PDF header. The file structure is damaged or not a valid PDF.');
    }

    let parsed: any;
    let parser: any;

    try {
      parser = new PDFParse(new Uint8Array(fileBuffer));
      await parser.load();
      parsed = await parser.getText();
    } catch (parseErr: any) {
      if (parser?.destroy) {
        try { await parser.destroy(); } catch {}
      }
      throw new Error(`Corrupt PDF: ${parseErr.message || 'The PDF document structure is corrupted or unreadable.'}`);
    }

    const rawText = parsed.text || '';
    const totalPages = parsed.total || (parsed.pages && parsed.pages.length) || 1;

    const pageList: { pageNumber: number; text: string }[] = [];
    let combinedWithMarkers = '';

    if (parsed.pages && Array.isArray(parsed.pages)) {
      for (const p of parsed.pages) {
        const pageNum = p.num || pageList.length + 1;
        const pageStr = (p.text || '').trim();
        pageList.push({ pageNumber: pageNum, text: pageStr });
        combinedWithMarkers += `\n[[PAGE_${pageNum}]]\n${pageStr}`;
      }
    } else {
      combinedWithMarkers = rawText;
    }

    // Clean out pagination footers and whitespace to verify true readable text length
    const cleanText = rawText
      .replace(/-- \d+ of \d+ --/g, '')
      .replace(/\[\[PAGE_\d+\]\]/g, '')
      .replace(/\s+/g, '')
      .trim();

    // If there are no readable text characters or less than 15 characters, it's a scanned PDF
    const isScanned = cleanText.length < 15;

    if (parser?.destroy) {
      try { await parser.destroy(); } catch {}
    }

    return {
      text: combinedWithMarkers,
      pageCount: totalPages,
      isScanned,
      pages: pageList,
      metadata: {
        rawLength: rawText.length,
        cleanLength: cleanText.length,
      },
    };
  }

  /**
   * Extract text from a DOCX file using mammoth.
   */
  async extractDOCX(filePath: string): Promise<ExtractionResult> {
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(filePath);
    } catch (readErr: any) {
      throw new Error(`File read error: ${readErr.message || 'Unable to read file from disk.'}`);
    }

    if (fileBuffer.length < 100) {
      throw new Error('Corrupt DOCX: The file is truncated or too small to be a valid Word document.');
    }

    let result: any;
    try {
      result = await mammoth.extractRawText({ buffer: fileBuffer });
    } catch (mammothErr: any) {
      throw new Error(`DOCX extraction failed: ${mammothErr.message || 'Corrupted or unreadable DOCX archive.'}`);
    }

    const text = result.value || '';
    const cleanText = text.replace(/\s+/g, '').trim();

    const isScanned = cleanText.length < 15;
    // Estimate page count (~2500 characters per typical contract page)
    const estimatedPages = Math.max(1, Math.ceil(text.length / 2500));

    return {
      text,
      pageCount: estimatedPages,
      isScanned,
      metadata: {
        messages: result.messages,
        cleanLength: cleanText.length,
      },
    };
  }

  /**
   * Router method to extract text based on file extension.
   */
  async extractText(filePath: string, originalName: string): Promise<ExtractionResult> {
    const ext = path.extname(originalName).toLowerCase();

    if (ext === '.pdf') {
      return this.extractPDF(filePath);
    }

    if (ext === '.docx') {
      return this.extractDOCX(filePath);
    }

    throw new Error(`Invalid file type: ${ext}. Only PDF and DOCX files are allowed.`);
  }
}

export const extractionService = new ExtractionService();
