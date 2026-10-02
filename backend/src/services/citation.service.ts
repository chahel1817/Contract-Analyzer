import { prisma } from '../utils/prisma';

export interface QuoteLocation {
  found: boolean;
  exactQuote?: string;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
  confidence: number;
}

export interface VerifiedQuoteResult {
  quote: string;
  verified: boolean;
  startOffset: number | null;
  endOffset: number | null;
  pageStart: number | null;
  pageEnd: number | null;
  chunkId?: string | null;
  confidence: number;
}

export interface ChunkRef {
  id: string;
  text?: string;
  content?: string | null;
  pageStart?: number | null;
  pageEnd?: number | null;
}

export class CitationService {
  /**
   * Normalizes text by removing redundant whitespace, line breaks,
   * standardizing quotes and dashes, and building an index map to the raw text.
   */
  normalizeText(raw: string): { normalized: string; indexMap: number[] } {
    let normalized = '';
    const indexMap: number[] = [];
    let inWhitespace = false;

    for (let i = 0; i < raw.length; i++) {
      let ch = raw[i];

      // Standardize smart/curly quotes & typographic symbols
      if (ch === '“' || ch === '”') ch = '"';
      else if (ch === '‘' || ch === '’') ch = "'";
      else if (ch === '—' || ch === '–') ch = '-';
      else if (ch === '\u00A0') ch = ' ';

      if (/\s/.test(ch)) {
        if (!inWhitespace && normalized.length > 0) {
          normalized += ' ';
          indexMap.push(i);
          inWhitespace = true;
        }
      } else {
        normalized += ch;
        indexMap.push(i);
        inWhitespace = false;
      }
    }

    return { normalized: normalized.trim(), indexMap };
  }

  /**
   * Finds the exact location of a candidate quote in the original raw document text.
   * Handles whitespace variations, line breaks across pages, and smart punctuation.
   */
  findQuote(candidateQuote: string, documentText: string): QuoteLocation {
    if (!candidateQuote || !candidateQuote.trim() || !documentText) {
      return { found: false, confidence: 0 };
    }

    const trimmedQuote = candidateQuote.trim();

    // 1. Direct Exact Match (Fast path)
    const directIdx = documentText.indexOf(trimmedQuote);
    if (directIdx !== -1) {
      const startOffset = directIdx;
      const endOffset = directIdx + trimmedQuote.length;
      const { pageStart, pageEnd } = this.resolvePageCoordinates(documentText, startOffset, endOffset);

      return {
        found: true,
        exactQuote: trimmedQuote,
        startOffset,
        endOffset,
        pageStart,
        pageEnd,
        confidence: 1.0,
      };
    }

    // 2. Normalized Match with Index Mapping (Handles whitespace differences, newlines, smart quotes)
    const { normalized: normDoc, indexMap: docMap } = this.normalizeText(documentText);
    const { normalized: normQuote } = this.normalizeText(trimmedQuote);

    const normIdx = normDoc.toLowerCase().indexOf(normQuote.toLowerCase());
    if (normIdx !== -1 && docMap[normIdx] !== undefined) {
      const normEndIdx = normIdx + normQuote.length - 1;
      const startOffset = docMap[normIdx];
      const endOffset = (docMap[normEndIdx] !== undefined ? docMap[normEndIdx] : startOffset + trimmedQuote.length) + 1;

      const exactQuote = documentText.slice(startOffset, endOffset);
      const { pageStart, pageEnd } = this.resolvePageCoordinates(documentText, startOffset, endOffset);

      return {
        found: true,
        exactQuote,
        startOffset,
        endOffset,
        pageStart,
        pageEnd,
        confidence: 0.98,
      };
    }

    // 3. Relaxed Punctuation Matching (Strips leading/trailing quotes or ellipses added by LLM)
    const strippedQuote = trimmedQuote
      .replace(/^["'“‘\s.]+|["'”’\s.]+$/g, '')
      .trim();

    if (strippedQuote.length >= 15) {
      const { normalized: strippedNormQuote } = this.normalizeText(strippedQuote);
      const strippedIdx = normDoc.toLowerCase().indexOf(strippedNormQuote.toLowerCase());

      if (strippedIdx !== -1 && docMap[strippedIdx] !== undefined) {
        const normEndIdx = strippedIdx + strippedNormQuote.length - 1;
        const startOffset = docMap[strippedIdx];
        const endOffset = (docMap[normEndIdx] !== undefined ? docMap[normEndIdx] : startOffset + strippedQuote.length) + 1;

        const exactQuote = documentText.slice(startOffset, endOffset);
        const { pageStart, pageEnd } = this.resolvePageCoordinates(documentText, startOffset, endOffset);

        return {
          found: true,
          exactQuote,
          startOffset,
          endOffset,
          pageStart,
          pageEnd,
          confidence: 0.92,
        };
      }
    }

    // 4. Section Header Prefix Stripping (e.g. "1. TERMINATION: Either party..." -> "Either party...")
    if (trimmedQuote.includes(':')) {
      const colonIdx = trimmedQuote.indexOf(':');
      if (colonIdx <= 40) {
        const afterColon = trimmedQuote.slice(colonIdx + 1).trim();
        if (afterColon.length >= 15) {
          const subResult = this.findQuote(afterColon, documentText);
          if (subResult.found) {
            return {
              ...subResult,
              confidence: 0.95,
            };
          }
        }
      }
    }

    // Quote was not found in the original document text (hallucinated or heavily paraphrased)
    return {
      found: false,
      confidence: 0,
    };
  }

  /**
   * Verifies an AI candidate quote against the original document text.
   * If found: returns verified: true with exact coordinates and chunk reference.
   * If not found: returns verified: false.
   */
  verifyQuote(
    candidateQuote: string,
    documentText: string,
    chunks: ChunkRef[] = []
  ): VerifiedQuoteResult {
    const location = this.findQuote(candidateQuote, documentText);

    if (location.found && location.startOffset !== undefined && location.endOffset !== undefined) {
      // Find matching chunk if possible
      let matchedChunkId: string | null = null;
      for (const chunk of chunks) {
        const chunkText = chunk.text || chunk.content || '';
        if (chunkText.includes(location.exactQuote || candidateQuote.trim())) {
          matchedChunkId = chunk.id;
          break;
        }
      }

      return {
        quote: location.exactQuote || candidateQuote,
        verified: true,
        startOffset: location.startOffset,
        endOffset: location.endOffset,
        pageStart: location.pageStart || 1,
        pageEnd: location.pageEnd || location.pageStart || 1,
        chunkId: matchedChunkId,
        confidence: location.confidence,
      };
    }

    return {
      quote: candidateQuote,
      verified: false,
      startOffset: null,
      endOffset: null,
      pageStart: null,
      pageEnd: null,
      chunkId: null,
      confidence: 0,
    };
  }

  /**
   * Helper to derive page numbers from [[PAGE_X]] markers in the original text
   */
  private resolvePageCoordinates(documentText: string, startOffset: number, endOffset: number) {
    const textBeforeStart = documentText.slice(0, startOffset);
    const startMatches = [...textBeforeStart.matchAll(/\[\[PAGE_(\d+)\]\]/g)];
    const pageStart = startMatches.length > 0 ? parseInt(startMatches[startMatches.length - 1][1], 10) : 1;

    const textBeforeEnd = documentText.slice(0, endOffset);
    const endMatches = [...textBeforeEnd.matchAll(/\[\[PAGE_(\d+)\]\]/g)];
    const pageEnd = endMatches.length > 0 ? parseInt(endMatches[endMatches.length - 1][1], 10) : pageStart;

    return { pageStart, pageEnd };
  }
}

export const citationService = new CitationService();
