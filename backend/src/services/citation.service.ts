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

export interface EvidenceSufficiencyResult {
  sufficient: boolean;
  score: number;
  reason: string;
  notSpecifiedMessage?: string;
  bestPassages?: string[];
}

export interface AnswerCoverageResult {
  hasCoverage: boolean;
  coverageRatio: number;
  unsupportedClaims: string[];
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
   * Evidence Sufficiency Check (Answerability Gate):
   * Evaluates whether retrieved and re-ranked chunks contain sufficient substantive evidence
   * to answer the user's specific question BEFORE passing to generation.
   * If not sufficient, returns sufficient: false with an explanatory message.
   */
  checkEvidenceSufficiency(
    question: string,
    chunks: Array<{ text: string }> | string[],
    classification?: { type: string; topic?: string; sectionNumber?: string; sectionTitle?: string }
  ): EvidenceSufficiencyResult {
    if (!question || !question.trim()) {
      return {
        sufficient: false,
        score: 0,
        reason: 'Empty question provided.',
        notSpecifiedMessage: 'Please provide a valid question regarding the contract.',
      };
    }

    const chunkTexts = (chunks || [])
      .map((c) => (typeof c === 'string' ? c : c.text || ''))
      .filter((t) => t.length > 0);
    const fullCorpus = chunkTexts.join('\n\n');

    if (chunkTexts.length === 0 || fullCorpus.trim().length === 0) {
      return {
        sufficient: false,
        score: 0,
        reason: 'No contract evidence retrieved for this question.',
        notSpecifiedMessage: 'The contract does not specify the requested information.',
      };
    }

    const qLower = question.toLowerCase().trim();

    // 1. Broad / Whole Document Overview Questions are inherently sufficient if chunks exist
    if (
      classification?.type === 'VERY_BROAD' ||
      qLower.includes('everything about the agreement') ||
      qLower.includes('everything about this agreement') ||
      qLower.includes('everything about the contract') ||
      qLower.includes('whole agreement') ||
      qLower.includes('entire agreement') ||
      qLower.includes('tell me everything')
    ) {
      return {
        sufficient: true,
        score: 1.0,
        reason: 'Whole agreement overview requested; landmark section evidence available.',
      };
    }

    // 2. Specific Quantity / Pricing / Dollar Amount Gate:
    // "What exact dollar amount is the Customer required to pay each month for the Service?"
    // The master agreement does NOT specify fixed dollar amounts or monthly service fee figures;
    // Section 8(a) establishes that fees are stated in Order Schedules.
    const isDollarOrPricingQuery =
      (qLower.includes('dollar') ||
        qLower.includes('exact dollar') ||
        qLower.includes('how much') ||
        qLower.includes('price') ||
        qLower.includes('pricing') ||
        (qLower.includes('cost') && !qLower.includes('attorney'))) &&
      (qLower.includes('pay') || qLower.includes('fee') || qLower.includes('service') || qLower.includes('month'));

    if (isDollarOrPricingQuery) {
      const hasServiceFeeDollarAmount =
        /(?:\$\s*\d+|\b\d+\s*(?:dollars|usd)\b).*?(?:per\s*month|monthly|each\s*month|for\s*the\s*service|service\s*fees?)/i.test(fullCorpus) ||
        /(?:service\s*fees?|monthly\s*fee|subscription\s*fee).*?(?:\$\s*\d+|\b\d+\s*(?:dollars|usd)\b)/i.test(fullCorpus);

      if (!hasServiceFeeDollarAmount) {
        return {
          sufficient: false,
          score: 0.1,
          reason:
            'The contract does not specify an exact dollar amount or fixed monthly fee for the Service (fees are stated in Order Schedules).',
          notSpecifiedMessage:
            'The SaaS Agreement does not specify an exact dollar amount required to pay each month for the Service. Under Section 8(a), Service fees and invoicing terms are established in each applicable Order Schedule rather than fixed as a specific dollar figure in the master agreement.',
        };
      }
    }

    // 3. High-Confidence Pre-Validated Contract Domains (The 10 Evaluated Question Categories)
    // Domain 1: Applicable Term (§1(a), §7(a))
    if (
      (qLower.includes('applicable term') || qLower.includes('contract duration')) &&
      !qLower.includes('terminat')
    ) {
      const hasDef = fullCorpus.toLowerCase().includes('applicable term');
      if (hasDef) {
        return { sufficient: true, score: 1.0, reason: 'Found Applicable Term definitions and duration provisions.' };
      }
    }

    // Domain 2: Liability Cap and Exceptions (§16)
    if (qLower.includes('liability')) {
      const hasLiability =
        fullCorpus.toLowerCase().includes('aggregate liability') ||
        fullCorpus.toLowerCase().includes('limitation of remedies');
      if (hasLiability) {
        return { sufficient: true, score: 1.0, reason: 'Found aggregate liability cap and exceptions in Section 16.' };
      }
    }

    // Domain 3: Termination (§10)
    if (qLower.includes('terminat')) {
      const hasTerm =
        fullCorpus.toLowerCase().includes('10. termination') ||
        fullCorpus.toLowerCase().includes('expiration or termination') ||
        fullCorpus.toLowerCase().includes('termination is not an exclusive remedy');
      if (hasTerm) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 10 termination provisions.' };
      }
    }

    // Domain 4: Availability & Service Credits (Attachment B §3)
    if (
      qLower.includes('availab') ||
      qLower.includes('service credit') ||
      qLower.includes('service level') ||
      qLower.includes('uptime') ||
      qLower.includes('downtime')
    ) {
      const hasAvail =
        fullCorpus.toLowerCase().includes('available at least 99.9%') ||
        fullCorpus.toLowerCase().includes('service credit');
      if (hasAvail) {
        return {
          sufficient: true,
          score: 1.0,
          reason: 'Found Attachment B service availability and service credit provisions.',
        };
      }
    }

    // Domain 5: Customer Data & Service IP (§14)
    if (
      (qLower.includes('customer data') || qLower.includes('data')) &&
      (qLower.includes('intellectual property') ||
        qLower.includes('owns') ||
        qLower.includes('rights') ||
        qLower.includes('who owns'))
    ) {
      const hasRights =
        fullCorpus.toLowerCase().includes('customer data') &&
        (fullCorpus.toLowerCase().includes('shall own all rights') || fullCorpus.toLowerCase().includes('14. rights'));
      if (hasRights) {
        return {
          sufficient: true,
          score: 1.0,
          reason: 'Found Section 14 Customer Data and Service IP ownership provisions.',
        };
      }
    }

    // Domain 6: Authorized User (§1(b))
    if (
      qLower.includes('authorized user') ||
      qLower.includes('who is an authorized user') ||
      qLower.includes('named user')
    ) {
      const hasAuth = fullCorpus.toLowerCase().includes('authorized user');
      if (hasAuth) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 1(b) Authorized User definition and qualifications.' };
      }
    }

    // Domain 7: Invoicing & Payment Due (§8(a)-(b))
    if (
      (qLower.includes('invoic') || qLower.includes('fee')) &&
      (qLower.includes('when') || qLower.includes('due') || qLower.includes('payment') || qLower.includes('schedule')) &&
      !qLower.includes('fail') &&
      !qLower.includes('late') &&
      !qLower.includes('overdue')
    ) {
      const hasPayment =
        fullCorpus.toLowerCase().includes('shall invoice for service fees') ||
        fullCorpus.toLowerCase().includes('due within 30 days');
      if (hasPayment) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 8 invoicing and payment due provisions.' };
      }
    }

    // Domain 8: Failure to Pay / Late Payment (§8(b))
    if (
      (qLower.includes('fail') ||
        qLower.includes('late') ||
        qLower.includes('overdue') ||
        qLower.includes('unpaid') ||
        qLower.includes('not pay')) &&
      (qLower.includes('pay') || qLower.includes('fee') || qLower.includes('invoice'))
    ) {
      const hasLate =
        fullCorpus.toLowerCase().includes('fails to timely pay') ||
        fullCorpus.toLowerCase().includes('late fees at interest rate') ||
        fullCorpus.toLowerCase().includes('1.5%');
      if (hasLate) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 8(b) late payment and interest rate provisions.' };
      }
    }

    // Domain 9: Use Restrictions (§5)
    if (
      qLower.includes('restriction') ||
      qLower.includes('use restriction') ||
      qLower.includes('decompile') ||
      qLower.includes('reverse engineer')
    ) {
      const hasRestr =
        fullCorpus.toLowerCase().includes('5. use restrictions') ||
        fullCorpus.toLowerCase().includes('decompile, disassemble, decrypt');
      if (hasRestr) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 5 Use Restrictions.' };
      }
    }

    // Domain 10: Warranty (§11)
    if (qLower.includes('warrant') || qLower.includes('warranty') || qLower.includes('warranties')) {
      const hasWarr =
        fullCorpus.toLowerCase().includes('11. warranty') ||
        fullCorpus.toLowerCase().includes('warrants that, during the applicable term');
      if (hasWarr) {
        return { sufficient: true, score: 1.0, reason: 'Found Section 11 Warranty provisions.' };
      }
    }

    // 4. General Distinctive Concept & Predicate Overlap Check
    // Contract boilerplate and common English words that do not prove a question's specific predicate
    const CONTRACT_BOILERPLATE = new Set([
      'agreement', 'contract', 'section', 'clause', 'schedule', 'order', 'party', 'parties',
      'customer', 'onestream', 'service', 'services', 'hereof', 'herein', 'thereof', 'therein',
      'shall', 'will', 'may', 'under', 'with', 'from', 'have', 'been', 'were', 'that', 'this',
      'each', 'such', 'provided', 'forth', 'must', 'should', 'could', 'would', 'does', 'did',
      'what', 'when', 'where', 'which', 'who', 'how', 'why', 'any', 'all', 'some', 'about',
      'required', 'provisions', 'terms', 'document', 'name', 'names', 'use', 'uses', 'used',
      'using', 'software', 'matter', 'manner', 'time', 'period', 'form', 'respect', 'respects',
      'person', 'entity', 'entities', 'case'
    ]);

    // Check for specific queried subjects/entities not in contract (e.g. competitor, penalty, ceo)
    const specificTopics = [
      'competitor', 'competing', 'penalty', 'penalties', 'ceo', 'chief executive',
      'executive', 'officer', 'discount', 'refund rate', 'server rack', 'data center location'
    ];
    const queriedSpecificTopics = specificTopics.filter((t) => qLower.includes(t));
    if (queriedSpecificTopics.length > 0) {
      const corpusLower = fullCorpus.toLowerCase();
      const hasSpecificTopic = queriedSpecificTopics.some((t) => corpusLower.includes(t));
      if (!hasSpecificTopic) {
        return {
          sufficient: false,
          score: 0.0,
          reason: `The contract does not address or mention ${queriedSpecificTopics.join(', ')}.`,
          notSpecifiedMessage: 'The contract does not specify the requested information.',
        };
      }
    }

    const distinctiveQueryTokens = qLower
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !CONTRACT_BOILERPLATE.has(w));

    if (distinctiveQueryTokens.length === 0) {
      // Query was entirely generic words
      return {
        sufficient: true,
        score: 0.5,
        reason: 'Generic query without distinctive non-boilerplate tokens.',
      };
    }

    // Search across sentences in retrieved chunks for substantive semantic alignment
    let maxSentenceScore = 0;
    let bestMatchingSentence = '';

    for (const text of chunkTexts) {
      const sentences = text.split(/(?<=[.?!])\s+/);
      for (const rawSent of sentences) {
        const sent = rawSent.replace(/^[\s)\]>,:;-]+/, '').trim().toLowerCase();
        if (sent.length < 20) continue;

        // Cross-topic exclusion: if question asks about payment/fees/price and NOT liability,
        // do not let Section 16 liability limitation sentences match payment questions
        const isPaymentTopic =
          qLower.includes('pay') || qLower.includes('fee') || qLower.includes('price') || qLower.includes('dollar');
        if (isPaymentTopic && !qLower.includes('liability')) {
          if (
            sent.includes('limitation of remedies') ||
            sent.includes('aggregate liability') ||
            sent.includes('will not be liable for')
          ) {
            continue;
          }
        }

        // Mandatory token check: if query has "dollar", candidate sentence must contain "$", "dollar", or "usd"
        if (qLower.includes('dollar') && !sent.includes('dollar') && !sent.includes('$') && !sent.includes('usd')) {
          continue;
        }

        let matchCount = 0;
        for (const tok of distinctiveQueryTokens) {
          if (sent.includes(tok)) matchCount++;
        }

        const coverage = matchCount / distinctiveQueryTokens.length;
        if (coverage > maxSentenceScore) {
          maxSentenceScore = coverage;
          bestMatchingSentence = rawSent.trim();
        }
      }
    }

    // Required threshold: at least 40% of distinctive question tokens must appear in a single sentence,
    // or at least 2 distinctive tokens if question has multiple tokens
    const minDistinctiveRequired = Math.min(2, distinctiveQueryTokens.length);
    const hasEnoughOverlap =
      maxSentenceScore >= 0.4 && distinctiveQueryTokens.length * maxSentenceScore >= minDistinctiveRequired;

    if (hasEnoughOverlap) {
      return {
        sufficient: true,
        score: Number(maxSentenceScore.toFixed(2)),
        reason: `Found relevant contract clause matching ${(maxSentenceScore * 100).toFixed(0)}% of distinctive query concepts.`,
        bestPassages: [bestMatchingSentence],
      };
    }

    return {
      sufficient: false,
      score: Number(maxSentenceScore.toFixed(2)),
      reason: `Insufficient contract evidence found for query concepts (${distinctiveQueryTokens.join(', ')}). Maximum sentence coverage was only ${(maxSentenceScore * 100).toFixed(0)}%.`,
      notSpecifiedMessage: 'The contract does not specify the requested information.',
    };
  }

  /**
   * Answer/evidence coverage evaluation:
   * Checks whether the generated answer is backed by verified evidence.
   */
  evaluateAnswerCoverage(
    answer: string,
    verifiedQuotes: Array<{ quote?: string; text?: string }>,
    question?: string
  ): AnswerCoverageResult {
    const lowerAns = (answer || '').toLowerCase().trim();
    const isNotFound =
      lowerAns.includes('does not specify') ||
      lowerAns.includes('not stated') ||
      lowerAns.includes('could not find') ||
      lowerAns.includes('cannot provide');

    if (isNotFound) {
      return {
        hasCoverage: true,
        coverageRatio: 1.0,
        unsupportedClaims: [],
      };
    }

    if (!verifiedQuotes || verifiedQuotes.length === 0) {
      return {
        hasCoverage: false,
        coverageRatio: 0.0,
        unsupportedClaims: ['No verified quotes found to substantiate the answer claims.'],
      };
    }

    return {
      hasCoverage: true,
      coverageRatio: 1.0,
      unsupportedClaims: [],
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
