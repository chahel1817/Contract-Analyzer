import { prisma } from '../utils/prisma';
import { chunkText } from '../utils';

export interface RetrievedChunk {
  id: string;
  chunkIndex: number;
  content: string;
  pageNumber: number | null;
  score: number;
}

export class RetrievalService {
  async indexDocument(documentId: string, fullText: string): Promise<number> {
    const rawChunks = chunkText(fullText, 1200, 200);

    // Delete any old chunks for this document
    await prisma.documentChunk.deleteMany({ where: { documentId } });

    await prisma.documentChunk.createMany({
      data: rawChunks.map((content, idx) => ({
        documentId,
        chunkIndex: idx,
        content: content.trim(),
        pageNumber: Math.floor(idx / 3) + 1,
      })),
    });

    return rawChunks.length;
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
