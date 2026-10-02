import { prisma } from '../utils/prisma';

export interface ChunkData {
  documentId: string;
  text: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  charStart: number;
  charEnd: number;
}

export class ChunkingService {
  /**
   * Splits extracted contract text into structured chunks with page and character coordinates.
   */
  createChunks(documentId: string, extractedText: string, chunkSize: number = 1000, overlap: number = 150): ChunkData[] {
    const chunks: ChunkData[] = [];
    if (!extractedText || extractedText.trim().length === 0) {
      return chunks;
    }

    // Check if text has [[PAGE_X]] markers
    const hasPageMarkers = extractedText.includes('[[PAGE_');

    if (hasPageMarkers) {
      // Parse page by page to ensure precise pageStart & pageEnd
      const pageRegex = /\[\[PAGE_(\d+)\]\]\s*([\s\S]*?)(?=(?:\[\[PAGE_\d+\]\]|$))/g;
      let match: RegExpExecArray | null;
      let globalCharOffset = 0;
      let chunkIdx = 0;

      while ((match = pageRegex.exec(extractedText)) !== null) {
        const pageNum = parseInt(match[1] || '1', 10);
        const pageContent = match[2] || '';
        let start = 0;

        while (start < pageContent.length) {
          let end = Math.min(start + chunkSize, pageContent.length);

          // Attempt to break at the end of a sentence or newline if not at end of page
          if (end < pageContent.length) {
            const lastPeriod = pageContent.lastIndexOf('. ', end);
            const lastNewline = pageContent.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod + 1, lastNewline);
            if (breakPoint > start + chunkSize * 0.5) {
              end = breakPoint;
            }
          }

          const chunkText = pageContent.slice(start, end).trim();
          if (chunkText.length > 0) {
            chunks.push({
              documentId,
              text: chunkText,
              chunkIndex: chunkIdx++,
              pageStart: pageNum,
              pageEnd: pageNum,
              charStart: globalCharOffset + start,
              charEnd: globalCharOffset + end,
            });
          }

          start += chunkSize - overlap;
          if (start >= pageContent.length || chunkSize <= overlap) break;
        }

        globalCharOffset += pageContent.length;
      }
    } else {
      // Plain text without page markers (e.g. DOCX or raw text)
      let start = 0;
      let chunkIdx = 0;
      const charsPerPage = 2500;

      while (start < extractedText.length) {
        let end = Math.min(start + chunkSize, extractedText.length);

        if (end < extractedText.length) {
          const lastPeriod = extractedText.lastIndexOf('. ', end);
          const lastNewline = extractedText.lastIndexOf('\n', end);
          const breakPoint = Math.max(lastPeriod + 1, lastNewline);
          if (breakPoint > start + chunkSize * 0.5) {
            end = breakPoint;
          }
        }

        const chunkText = extractedText.slice(start, end).trim();
        if (chunkText.length > 0) {
          const pageStart = Math.floor(start / charsPerPage) + 1;
          const pageEnd = Math.floor(end / charsPerPage) + 1;

          chunks.push({
            documentId,
            text: chunkText,
            chunkIndex: chunkIdx++,
            pageStart,
            pageEnd,
            charStart: start,
            charEnd: end,
          });
        }

        start += chunkSize - overlap;
        if (start >= extractedText.length || chunkSize <= overlap) break;
      }
    }

    return chunks;
  }

  /**
   * Flow:
   * extractedText -> chunks -> DocumentChunk table
   */
  async processAndStoreChunks(documentId: string, extractedText: string): Promise<number> {
    const chunks = this.createChunks(documentId, extractedText);

    // Remove any previous chunks for idempotency
    await prisma.documentChunk.deleteMany({
      where: { documentId },
    });

    if (chunks.length > 0) {
      await prisma.documentChunk.createMany({
        data: chunks.map((c) => ({
          documentId: c.documentId,
          text: c.text,
          content: c.text, // for backward compatibility
          chunkIndex: c.chunkIndex,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          charStart: c.charStart,
          charEnd: c.charEnd,
          pageNumber: c.pageStart,
        })),
      });
    }

    return chunks.length;
  }
}

export const chunkingService = new ChunkingService();
