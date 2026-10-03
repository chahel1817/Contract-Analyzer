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
   * Validates whether a candidate quote is substantive evidence rather than
   * an isolated defined term, a section heading, or an empty phrase fragment.
   * Enforces Rule 15: QUOTE QUALITY REQUIREMENTS.
   */
  isSubstantiveQuote(quote: string): boolean {
    if (!quote || typeof quote !== 'string') return false;
    // Strip leading clause numbering or bullets like (a), (i), 1., •, etc.
    const cleaned = quote.replace(/^(?:\([a-zA-Z\d]+\)|\d{1,2}[.)]|[•\-*])\s*/i, '').trim();
    const strippedQuotes = cleaned.replace(/^["'“”]+|["'“”]+$/g, '').trim();
    const words = strippedQuotes.split(/\s+/).filter((w) => w.length > 0);

    // 1. Minimum words and character length
    if (words.length < 5 || strippedQuotes.length < 25) return false;

    // 2. Reject isolated defined terms or nouns (e.g. "Applicable Term", "Customer Data")
    if (
      /^(?:Applicable Term|Customer Data|OneStream|Order Schedule|Confidential Information|Authorized User|Effective Date|Service|Documentation|Agreement)$/i.test(
        strippedQuotes
      )
    ) {
      return false;
    }

    // 3. Reject section headings
    if (
      /^(?:section\s+\d+|clause\s+\d+|article\s+\d+|attachment\s+[a-z]|\d+\.\s+[A-Z\s]+)$/i.test(
        strippedQuotes
      )
    ) {
      return false;
    }

    // 4. Must contain a contractual action verb, definitional verb, or legal condition keyword
    const contractualVerbs =
      /\b(means?|shall|will|agrees?|may|is|are|was|were|warrants?|terminates?|survives?|exceeds?|provides?|includes?|begins?|commences?|continues?|holds?|refunds?|pays?|paid|owed|due|applies|apply|limited|liable|exclude|cease|except|claimed|case|breach|indemnity|negligence|misconduct|fraud|occurred?|fail(s|ed|ure)?|credit|credits|request|issued?|entitled?)\b/i;
    if (!contractualVerbs.test(cleaned)) {
      return false;
    }

    return true;
  }

  /**
   * Two-stage verification step 2: Does the quote sufficiently support the answer?
   * Checks semantic concept alignment between the candidate quote, the generated answer,
   * and the question / explanation.
   */
  doesQuoteSupportAnswer(
    quote: string,
    answer: string,
    question?: string,
    supportsExplanation?: string
  ): { supports: boolean; score: number; reason?: string } {
    if (!quote || !answer) {
      return { supports: false, score: 0, reason: 'Missing quote or answer' };
    }

    // Common English and contract boilerplate words that do not prove a topical conclusion on their own
    const STOP_WORDS = new Set([
      'that', 'this', 'with', 'from', 'have', 'been', 'were', 'what', 'when', 'where',
      'which', 'will', 'would', 'shall', 'should', 'could', 'about', 'under', 'their',
      'there', 'these', 'those', 'other', 'after', 'before', 'between', 'during', 'such',
      'each', 'both', 'either', 'neither', 'some', 'any', 'every', 'into', 'over', 'than',
      // Generic contract boilerplate terms that appear on nearly every page
      'agreement', 'party', 'parties', 'contract', 'section', 'hereof', 'herein',
      'thereof', 'therein', 'schedule', 'schedules', 'order', 'orders', 'customer',
      'onestream', 'service', 'services'
    ]);

    const tokenize = (text: string): Set<string> => {
      const words = text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
      return new Set(words);
    };

    const quoteTerms = tokenize(quote);
    const answerTerms = tokenize(answer);
    const questionTerms = question ? tokenize(question) : new Set<string>();
    const explanationTerms = supportsExplanation ? tokenize(supportsExplanation) : new Set<string>();

    if (quoteTerms.size === 0 || answerTerms.size === 0) {
      return { supports: false, score: 0, reason: 'Insufficient key terms' };
    }

    // Calculate term overlap between quote and answer/explanation/question
    let matchInAnswer = 0;
    for (const term of quoteTerms) {
      if (answerTerms.has(term) || explanationTerms.has(term) || questionTerms.has(term)) {
        matchInAnswer++;
      }
    }

    const overlapRatio = matchInAnswer / quoteTerms.size;

    // Direct verbatim quote inclusion in answer: if the answer quotes this exact passage
    const cleanQuote = quote.replace(/^[“"']+|[”"']+$/g, '').trim();
    if (cleanQuote.length >= 15 && answer.includes(cleanQuote)) {
      return { supports: true, score: 1.0, reason: 'Direct verbatim quote in answer' };
    }

    // To prove the conclusion, the quote must share substantive topical terms (overlapRatio >= 0.35 with at least 2 substantive matches)
    if (matchInAnswer >= 2 && overlapRatio >= 0.35) {
      return {
        supports: true,
        score: Math.min(1.0, Number((overlapRatio + 0.2).toFixed(2))),
        reason: `Shares ${matchInAnswer} substantive topical terms (${Math.round(overlapRatio * 100)}% overlap)`,
      };
    }

    return {
      supports: false,
      score: Number(overlapRatio.toFixed(2)),
      reason: `Insufficient substantive topical overlap with answer (${matchInAnswer} matches, ${Math.round(overlapRatio * 100)}% overlap)`,
    };
  }

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

      // Standardize smart/curly quotes & typographic symbols (normalize single, double, and typographic quotes to ")
      if (ch === '“' || ch === '”' || ch === '‘' || ch === '’' || ch === "'" || ch === '`') ch = '"';
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
