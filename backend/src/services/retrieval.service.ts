import { prisma } from '../utils/prisma';

export interface RetrievedChunk {
  id: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  score: number;
}

export class RetrievalService {
  chunkDocument(text: string, chunkSize: number = 1000, overlap: number = 150): { content: string; pageNumber: number }[] {
    const chunks: { content: string; pageNumber: number }[] = [];

    // Check if we have page markers [[PAGE_X]]
    const pageSplits = text.split(/\[\[PAGE_(\d+)\]\]/);

    if (pageSplits.length > 1) {
      for (let i = 1; i < pageSplits.length; i += 2) {
        const pageNum = parseInt(pageSplits[i] || '1', 10);
        const pageContent = (pageSplits[i + 1] || '').trim();
        if (!pageContent) continue;

        let start = 0;
        while (start < pageContent.length) {
          const end = Math.min(start + chunkSize, pageContent.length);
          const chunkStr = pageContent.slice(start, end).trim();
          if (chunkStr.length > 0) {
            chunks.push({ content: chunkStr, pageNumber: pageNum });
          }
          start += chunkSize - overlap;
          if (start >= pageContent.length || chunkSize <= overlap) break;
        }
      }
    } else {
      let start = 0;
      while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        const chunkStr = text.slice(start, end).trim();
        if (chunkStr.length > 0) {
          const estimatedPage = Math.floor(start / 2500) + 1;
          chunks.push({ content: chunkStr, pageNumber: estimatedPage });
        }
        start += chunkSize - overlap;
        if (start >= text.length || chunkSize <= overlap) break;
      }
    }

    return chunks;
  }

  async indexDocument(documentId: string, fullText: string): Promise<number> {
    const chunks = this.chunkDocument(fullText);

    // Remove any previous chunks for document
    await prisma.documentChunk.deleteMany({ where: { documentId } });

    if (chunks.length > 0) {
      await prisma.documentChunk.createMany({
        data: chunks.map((c, idx) => ({
          documentId,
          chunkIndex: idx,
          content: c.content,
          pageNumber: c.pageNumber,
        })),
      });
    }

    return chunks.length;
  }

  async retrieveRelevantChunks(documentId: string, query: string, limit: number = 5): Promise<RetrievedChunk[]> {
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
    });

    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = chunks.map((chunk) => {
      const lower = chunk.content.toLowerCase();
      let matchCount = 0;
      for (const token of queryTokens) {
        if (lower.includes(token)) matchCount += 1;
      }
      const score = matchCount / (queryTokens.length || 1);
      return {
        id: chunk.id,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        pageNumber: chunk.pageNumber,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}

export const retrievalService = new RetrievalService();
