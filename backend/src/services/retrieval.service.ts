import { prisma } from '../utils/prisma';

export interface RetrievedChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  charStart: number | null;
  charEnd: number | null;
  score: number;
  matchedKeywords: string[];
}

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'can\'t', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing',
  'don\'t', 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if', 'in',
  'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most', 'mustn\'t', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours',
  'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d', 'she\'ll', 'she\'s', 'should',
  'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s', 'the', 'their', 'theirs', 'them',
  'themselves', 'then', 'there', 'there\'s', 'these', 'they', 'they\'d', 'they\'ll', 'they\'re', 'they\'ve',
  'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d',
  'we\'ll', 'we\'re', 'we\'ve', 'were', 'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where',
  'where\'s', 'which', 'while', 'who', 'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would',
  'wouldn\'t', 'you', 'you\'d', 'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves'
]);

export class RetrievalService {
  /**
   * Tokenize user query into meaningful keywords (excluding punctuation and stop words).
   */
  tokenizeQuery(query: string): string[] {
    const rawTokens = query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2);

    const filtered = rawTokens.filter((t) => !STOP_WORDS.has(t));
    return filtered.length > 0 ? filtered : rawTokens;
  }

  /**
   * Search chunks of a document using keyword matching, phrase boosting, and frequency scoring.
   * Flow: Question -> Search chunks -> Relevant chunks
   */
  async searchDocument(query: string, documentId: string, limit: number = 5): Promise<RetrievedChunk[]> {
    if (!query || !query.trim() || !documentId) {
      return [];
    }

    // 1. Fetch all chunks associated with this document
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      return [];
    }

    const keywords = this.tokenizeQuery(query);
    const normalizedQuery = query.toLowerCase().trim();

    // 2. Score each chunk based on keyword frequency and exact phrase matching
    const scoredChunks = chunks.map((chunk) => {
      const chunkText = chunk.text || chunk.content || '';
      const lowerText = chunkText.toLowerCase();

      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const kw of keywords) {
        // Count occurrences of keyword in chunk
        const regex = new RegExp(`\\b${kw}`, 'gi');
        const matches = lowerText.match(regex);
        if (matches) {
          matchCount += matches.length;
          matchedKeywords.push(kw);
        }
      }

      // Keyword coverage ratio (how many distinct query keywords appeared)
      const coverage = matchedKeywords.length / (keywords.length || 1);

      // Base score from term frequency and keyword coverage
      let score = coverage * 0.7 + Math.min(matchCount / 10, 0.3);

      // Exact phrase bonus: if exact sequence of words appears in chunk
      if (keywords.length > 1 && lowerText.includes(normalizedQuery)) {
        score += 1.0;
      }

      // Proximity / sub-phrase bonus (e.g. 2 adjacent query words)
      for (let i = 0; i < keywords.length - 1; i++) {
        const pair = `${keywords[i]} ${keywords[i + 1]}`;
        if (lowerText.includes(pair)) {
          score += 0.3;
        }
      }

      return {
        id: chunk.id,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        text: chunkText,
        pageStart: chunk.pageStart || chunk.pageNumber,
        pageEnd: chunk.pageEnd || chunk.pageNumber,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        score: Number(score.toFixed(4)),
        matchedKeywords: Array.from(new Set(matchedKeywords)),
      };
    });

    // 3. Filter chunks that had at least one keyword match, or fallback to first chunks if none
    const relevantChunks = scoredChunks
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score);

    return relevantChunks.slice(0, limit);
  }

  /**
   * Alias method for backward compatibility
   */
  async retrieveRelevantChunks(documentId: string, query: string, limit: number = 5): Promise<RetrievedChunk[]> {
    return this.searchDocument(query, documentId, limit);
  }
}

export const retrievalService = new RetrievalService();
