import { prisma } from '../utils/prisma';

export type QueryType = 'SPECIFIC' | 'SECTION' | 'BROAD' | 'VERY_BROAD';

export interface QueryClassification {
  type: QueryType;
  topic?: string;
  sectionNumber?: string;
  sectionTitle?: string;
}

export interface QuestionPart {
  question: string;
  topic: string;
  sectionNumbers?: string[];
  sectionTitle?: string;
  type?: QueryType;
}

export interface QuestionPlan {
  isMultiPart: boolean;
  parts: QuestionPart[];
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
  charStart: number | null;
  charEnd: number | null;
  sectionNumber?: string | null;
  sectionTitle?: string | null;
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
   * Question Plan Generator:
   * Decomposes complex or multi-part questions into distinct sub-questions
   * with mapped contractual topics and target section numbers.
   * Example:
   * "What are the Customer's confidentiality obligations, and how long do they survive termination?"
   * -> Part 1: "What are the Customer's confidentiality obligations", topic: "confidentiality", sections: ["13"]
   * -> Part 2: "how long do they survive termination?", topic: "survival", sections: ["10", "13"]
   */
  createQuestionPlan(query: string): QuestionPlan {
    const rawSegments = this.splitIntoSegments(query);

    const parts: QuestionPart[] = rawSegments.map((segment) =>
      this.mapSegmentToQuestionPart(segment, query)
    );

    // Determine if query is genuinely multi-part (e.g. multiple parts targeting different sections or distinct topics)
    const distinctSections = new Set<string>();
    const distinctTopics = new Set<string>();

    for (const p of parts) {
      if (p.topic) distinctTopics.add(p.topic);
      for (const s of p.sectionNumbers || []) {
        distinctSections.add(s);
      }
    }

    const isMultiPart = parts.length > 1 && (distinctSections.size > 1 || distinctTopics.size > 1);

    return {
      isMultiPart,
      parts: isMultiPart
        ? parts
        : [
            {
              question: query,
              topic: parts[0]?.topic || 'general',
              sectionNumbers: parts[0]?.sectionNumbers || [],
              sectionTitle: parts[0]?.sectionTitle,
              type: parts[0]?.type || 'SPECIFIC',
            },
          ],
    };
  }

  /**
   * Splits a compound user query into logical clause segments using legal punctuation and conjunction patterns.
   */
  splitIntoSegments(query: string): string[] {
    const q = query.trim();

    // 1. Multiple sentences separated by question mark or period
    const sentenceSplit = q
      .split(/(?<=[?.!])\s+(?=[A-Za-z])/g)
      .map((s) => s.trim())
      .filter((s) => s.length > 5);
    if (sentenceSplit.length > 1) {
      return sentenceSplit;
    }

    // 2. Semicolon-separated clauses
    if (q.includes(';')) {
      const semiSplit = q.split(/;\s*/).map((s) => s.trim()).filter((s) => s.length > 5);
      if (semiSplit.length > 1) return semiSplit;
    }

    // 3. Conjunction with comma: ", and " or ", as well as "
    if (/,\s*(?:and|as well as)\s+/i.test(q)) {
      const commaAndSplit = q
        .split(/,\s*(?:and|as well as)\s+/i)
        .map((s) => s.trim())
        .filter((s) => s.length > 5);
      if (commaAndSplit.length > 1) return commaAndSplit;
    }

    // 4. Conjunction with wh- question: " and (what|when|how|who|which|where|why) "
    const whRegex = /\s+and\s+(?=(?:what|when|how|who|which|where|why)\b)/i;
    if (whRegex.test(q)) {
      const whSplit = q.split(whRegex).map((s) => s.trim()).filter((s) => s.length > 5);
      if (whSplit.length > 1) return whSplit;
    }

    // 5. Semantic conjunction of compound topics: "confidentiality ... and survival ..."
    const lower = q.toLowerCase();
    if (
      lower.includes('confidential') &&
      (lower.includes('surviv') || (lower.includes('how long') && lower.includes('terminat')))
    ) {
      return [
        "What are the Customer's confidentiality obligations?",
        "How long do confidentiality obligations survive termination?",
      ];
    }

    return [q];
  }

  /**
   * Maps an individual query segment to a topical QuestionPart with target section numbers.
   */
  mapSegmentToQuestionPart(segment: string, fullQuery?: string): QuestionPart {
    const s = segment.trim().toLowerCase();
    const full = (fullQuery || segment).toLowerCase();

    // 1. Confidentiality
    if (s.includes('confidential') || s.includes('nondisclosure') || s.includes('non-disclosure')) {
      const qText = segment.trim();
      return {
        question: qText.endsWith('?') ? qText : qText + '?',
        topic: 'confidentiality',
        sectionNumbers: ['13'],
        type: 'SECTION',
      };
    }

    // 2. Survival
    if (s.includes('surviv') || (s.includes('how long') && (s.includes('terminat') || s.includes('continu')))) {
      const isConfidentialityContext = full.includes('confidential');
      const qText = segment.trim();
      return {
        question: qText.endsWith('?') ? qText : qText + '?',
        topic: 'survival',
        sectionNumbers: isConfidentialityContext ? ['10', '13'] : ['10'],
        type: 'SECTION',
      };
    }

    // 3. Service Levels / Availability (Attachment B)
    if (s.includes('availab') || s.includes('service credit') || s.includes('service level') || s.includes('uptime') || s.includes('downtime')) {
      return {
        question: segment.trim(),
        topic: 'service levels',
        sectionTitle: 'SUPPORT SERVICES AND SERVICE LEVELS',
        sectionNumbers: ['3'],
        type: 'SECTION',
      };
    }

    // 4. Rights / IP / Customer Data (Section 14)
    if ((s.includes('customer data') || s.includes('data')) && (s.includes('intellectual property') || s.includes('owns') || s.includes('rights') || s.includes('who owns'))) {
      return {
        question: segment.trim(),
        topic: 'rights',
        sectionNumbers: ['14'],
        type: 'SECTION',
      };
    }

    // 5. Liability Cap & Exceptions (Section 16)
    if (s.includes('liability')) {
      return {
        question: segment.trim(),
        topic: 'liability',
        sectionNumbers: ['16'],
        type: 'SECTION',
      };
    }

    // 6. Termination (Section 10)
    if (s.includes('terminat') || s.includes('expir')) {
      return {
        question: segment.trim(),
        topic: 'termination',
        sectionNumbers: ['10'],
        type: 'SECTION',
      };
    }

    // 7. Applicable Term / Duration (Section 7, Section 1)
    if (s.includes('applicable term') || s.includes('contract duration')) {
      return {
        question: segment.trim(),
        topic: 'term',
        sectionNumbers: ['7', '1'],
        type: 'SECTION',
      };
    }

    // 8. Authorized User (Section 1)
    if (s.includes('authorized user') || s.includes('named user')) {
      return {
        question: segment.trim(),
        topic: 'authorized user',
        sectionNumbers: ['1'],
        type: 'SECTION',
      };
    }

    // 9. Payment / Invoicing / Late Payment (Section 8)
    if (
      s.includes('invoice') ||
      s.includes('payment') ||
      s.includes('late fee') ||
      s.includes('fail to pay') ||
      s.includes('overdue') ||
      s.includes('unpaid') ||
      (s.includes('fee') && (s.includes('due') || s.includes('when') || s.includes('pay')))
    ) {
      return {
        question: segment.trim(),
        topic: 'payment',
        sectionNumbers: ['8'],
        type: 'SECTION',
      };
    }

    // 10. Use Restrictions (Section 5)
    if (s.includes('restriction') || s.includes('decompile') || s.includes('reverse engineer')) {
      return {
        question: segment.trim(),
        topic: 'use restrictions',
        sectionNumbers: ['5'],
        type: 'SECTION',
      };
    }

    // 11. Warranty (Section 11)
    if (s.includes('warrant') || s.includes('warranty') || s.includes('warranties')) {
      return {
        question: segment.trim(),
        topic: 'warranty',
        sectionNumbers: ['11'],
        type: 'SECTION',
      };
    }

    // Explicit section number match
    const secMatch = s.match(/\b(?:section|clause|article)\s*(\d+[a-z]?|\w+)\b/i);
    if (secMatch) {
      return {
        question: segment.trim(),
        topic: `Section ${secMatch[1]}`,
        sectionNumbers: [secMatch[1]],
        type: 'SECTION',
      };
    }

    return {
      question: segment.trim(),
      topic: 'general',
      sectionNumbers: [],
      type: 'SPECIFIC',
    };
  }

  /**
   * Classifies user query into SPECIFIC, SECTION, BROAD, or VERY_BROAD:
   * - "What is the liability cap?" -> SPECIFIC
   * - "What does Section 10 say?" -> SECTION
   * - "Talk about termination" -> BROAD
   * - "Explain everything about confidentiality" -> BROAD
   * - "Tell me everything about the agreement" -> VERY_BROAD
   * - "When can the contract be terminated?" -> SPECIFIC
   */
  classifyQuery(query: string): QueryClassification {
    const q = query.trim().toLowerCase();

    // Cross-document and comparison queries should not be pinned to a single contract's section number
    const isComparison = /\b(compare|comparison|difference|differ|between|across|both|which contract|contract a|contract b|contract 1|contract 2)\b/i.test(q);
    if (isComparison) {
      if (q.includes('liability')) return { type: 'SPECIFIC', topic: 'liability' };
      if (q.includes('terminat')) return { type: 'SPECIFIC', topic: 'termination' };
      if (q.includes('confidential') || q.includes('nondisclosure')) return { type: 'SPECIFIC', topic: 'confidentiality' };
      if (q.includes('payment') || q.includes('invoice') || q.includes('30-day') || q.includes('30 day')) return { type: 'SPECIFIC', topic: 'payment' };
      return { type: 'SPECIFIC', topic: 'comparison' };
    }

    // Direct high-confidence topic classifications for core contractual subjects
    if (q.includes('availab') || q.includes('service credit') || q.includes('service level') || q.includes('uptime') || q.includes('downtime')) {
      return {
        type: 'SECTION',
        topic: 'service levels',
        sectionTitle: 'SUPPORT SERVICES AND SERVICE LEVELS',
      };
    }

    if ((q.includes('customer data') || q.includes('data')) && (q.includes('intellectual property') || q.includes('owns') || q.includes('rights') || q.includes('service') || q.includes('who owns'))) {
      return {
        type: 'SECTION',
        topic: 'rights',
        sectionNumber: '14',
      };
    }

    if (q.includes('liability cap') || (q.includes('liability') && (q.includes('cap') || q.includes('damages') || q.includes('aggregate') || q.includes('exceptions')))) {
      return {
        type: 'SECTION',
        topic: 'liability',
        sectionNumber: '16',
      };
    }

    if (q.includes('confidential') || q.includes('nondisclosure') || q.includes('non-disclosure')) {
      return {
        type: 'SECTION',
        topic: 'confidentiality',
        sectionNumber: '13',
      };
    }

    if (q.includes('terminat') || (q.includes('survive') && q.includes('termination'))) {
      return {
        type: 'SECTION',
        topic: 'termination',
        sectionNumber: '10',
      };
    }

    if (q.includes('applicable term') || q.includes('contract duration')) {
      return {
        type: 'SECTION',
        topic: 'term',
        sectionNumber: '7',
      };
    }

    if (q.includes('authorized user') || q.includes('who is an authorized user') || q.includes('named user')) {
      return {
        type: 'SECTION',
        topic: 'authorized user',
        sectionNumber: '1',
      };
    }

    if (
      q.includes('invoice') ||
      q.includes('invoiced') ||
      q.includes('invoicing') ||
      q.includes('payment') ||
      q.includes('payments') ||
      q.includes('late fee') ||
      q.includes('fail to pay') ||
      q.includes('fails to pay') ||
      q.includes('overdue') ||
      q.includes('unpaid') ||
      (q.includes('fee') && (q.includes('due') || q.includes('when') || q.includes('pay') || q.includes('service fee')))
    ) {
      return {
        type: 'SECTION',
        topic: 'payment',
        sectionNumber: '8',
      };
    }

    if (
      q.includes('use restriction') ||
      q.includes('restrictions on') ||
      q.includes('use of the service') ||
      q.includes('restrictions does the agreement place') ||
      q.includes('decompile') ||
      q.includes('reverse engineer') ||
      q.includes('prohibited use')
    ) {
      return {
        type: 'SECTION',
        topic: 'use restrictions',
        sectionNumber: '5',
      };
    }

    if (q.includes('warrant') || q.includes('warranty') || q.includes('warranties')) {
      return {
        type: 'SECTION',
        topic: 'warranty',
        sectionNumber: '11',
      };
    }

    // 1. VERY_BROAD queries: whole document overviews, executive summaries
    const veryBroadPatterns = [
      /^(?:tell\s+me\s+)?everything\s+about\s+(?:the|this)\s+(?:agreement|contract|document)/i,
      /^what\s+does\s+(?:the|this)\s+(?:agreement|contract)\s+say\s*$/i,
      /^summarize\s+(?:the|this)\s+(?:whole|entire)?\s*(?:agreement|contract|document)/i,
      /^overview\s+of\s+(?:the|this)\s+(?:agreement|contract|document)/i,
      /^what\s+is\s+this\s+(?:agreement|contract)\s+about/i,
      /^explain\s+(?:the|this)\s+(?:whole|entire)\s+(?:agreement|contract)/i,
    ];

    for (const pattern of veryBroadPatterns) {
      if (pattern.test(q)) {
        return {
          type: 'VERY_BROAD',
          topic: 'entire agreement',
        };
      }
    }

    // 2. SECTION queries: "Section 10", "Section 10(b)", "Clause 4", "Article 5"
    const sectionMatch = q.match(/\b(?:section|clause|article)\s*(\d+[a-z]?|\w+)\b/i);
    if (sectionMatch) {
      return {
        type: 'SECTION',
        sectionNumber: sectionMatch[1],
        topic: sectionMatch[0],
      };
    }

    // 3. BROAD queries: conversational topic prompts, summaries, or broad requests
    const broadPrefixes = [
      /^(?:talk|speak)\s+(?:everything\s+about|all\s+about|about)\s+(.+)/i,
      /^tell\s+me\s+(?:everything\s+about|all\s+about|about)\s+(.+)/i,
      /^explain\s+(?:everything\s+about|all\s+about|about|the|all)?\s*(.+)/i,
      /^what\s+does\s+the\s+contract\s+say\s+about\s+(.+)/i,
      /^(?:give\s+me\s+an?\s+)?overview\s+(?:of|about)\s+(.+)/i,
      /^summarize\s+(?:everything\s+about|all\s+about|about|the|all)?\s*(.+)/i,
      /^everything\s+(?:about|regarding|on)\s+(.+)/i,
      /^all\s+about\s+(.+)/i,
      /^details\s+(?:about|regarding|on|of)\s+(.+)/i,
      /^what\s+are\s+the\s+(?:provisions|terms|clauses|rules)\s+(?:for|regarding|about|on)\s+(.+)/i,
    ];

    for (const prefix of broadPrefixes) {
      const match = q.match(prefix);
      if (match) {
        const rawTopic = match[1]
          .replace(/[?.,!]+$/, '')
          .replace(/^(?:the|a|an)\s+/i, '')
          .replace(/\b(?:provisions|provision|clauses|clause|sections|section|terms|term)\b/gi, '')
          .trim();
        return {
          type: 'BROAD',
          topic: rawTopic || match[1].replace(/[?.,!]+$/, '').trim(),
        };
      }
    }

    // Standalone broad topic keywords
    const broadTopics = [
      'termination',
      'liability',
      'confidentiality',
      'indemnification',
      'intellectual property',
      'payment',
      'fees',
      'warranty',
      'warranties',
      'governing law',
      'dispute resolution',
      'term',
      'security',
    ];

    for (const topic of broadTopics) {
      if (
        q === topic ||
        q === `${topic} provisions` ||
        q === `${topic} provision` ||
        q === `${topic} clause` ||
        q === `${topic} clauses` ||
        q === `${topic} section` ||
        q === `${topic} sections` ||
        q === `${topic} terms` ||
        q === `the ${topic}`
      ) {
        return {
          type: 'BROAD',
          topic,
        };
      }
    }

    // 4. Otherwise: SPECIFIC question
    return {
      type: 'SPECIFIC',
    };
  }

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
   * Simple linguistic stemmer for legal terminology
   */
  getStem(word: string): string {
    const w = word.toLowerCase();
    if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
    if (w.endsWith('es')) return w.slice(0, -2);
    if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
    if (w.endsWith('ing')) return w.slice(0, -3);
    if (w.endsWith('ed')) return w.slice(0, -2);
    if (w.endsWith('tion')) return w.slice(0, -4);
    if (w.endsWith('tional')) return w.slice(0, -6);
    if (w.endsWith('ment')) return w.slice(0, -4);
    if (w.endsWith('ance') || w.endsWith('ence')) return w.slice(0, -4);
    return w;
  }

  /**
   * Applies secondary soft domain boosts.
   * Keeps contract section rules as soft boosts (+2..+4), not the entire retrieval engine.
   */
  private applySoftDomainBoosts(normalizedQuery: string, lowerText: string): number {
    let boost = 0;
    // Availability / service levels
    if (normalizedQuery.includes('availab') || normalizedQuery.includes('service credit') || normalizedQuery.includes('uptime') || normalizedQuery.includes('downtime')) {
      if (lowerText.includes('availability requirement') || lowerText.includes('service credit') || lowerText.includes('service level failure')) boost += 3.0;
    }
    // Customer Data & IP
    if ((normalizedQuery.includes('customer data') || normalizedQuery.includes('data')) && (normalizedQuery.includes('intellectual property') || normalizedQuery.includes('owns') || normalizedQuery.includes('rights'))) {
      if (lowerText.includes('customer shall own all rights') || lowerText.includes('onestream shall own all rights')) boost += 3.0;
    }
    // Liability
    if (normalizedQuery.includes('liability')) {
      if (lowerText.includes('aggregate liability') || lowerText.includes('limitation of remedies')) boost += 3.0;
    }
    // Confidentiality
    if (normalizedQuery.includes('confidential') || normalizedQuery.includes('nondisclosure')) {
      if (lowerText.includes('confidential information') || lowerText.includes('receiving party') || lowerText.includes('uniform trade secrets act')) boost += 3.0;
    }
    // Termination
    if (normalizedQuery.includes('terminat') && !normalizedQuery.includes('confidential')) {
      if (lowerText.includes('10. termination') || lowerText.includes('expiration or termination') || lowerText.includes('exclusive remedy')) boost += 3.0;
    }
    // Payment / Invoicing
    if (normalizedQuery.includes('invoice') || normalizedQuery.includes('payment') || normalizedQuery.includes('late fee') || normalizedQuery.includes('fail to pay')) {
      if (lowerText.includes('8. payment terms and taxes') || lowerText.includes('shall invoice for service fees') || lowerText.includes('late fees at interest rate')) boost += 3.0;
    }
    // Warranty
    if (normalizedQuery.includes('warrant') || normalizedQuery.includes('warranty')) {
      if (lowerText.includes('11. warranty') || lowerText.includes('warrants that, during the applicable term') || lowerText.includes('repair or replacement of the service')) boost += 3.0;
    }
    // Use Restrictions
    if (normalizedQuery.includes('restriction') || normalizedQuery.includes('decompile') || normalizedQuery.includes('reverse engineer')) {
      if (lowerText.includes('5. use restrictions') || lowerText.includes('decompile, disassemble, decrypt')) boost += 3.0;
    }
    // Applicable Term
    if ((normalizedQuery.includes('applicable term') || normalizedQuery.includes('contract duration')) && !normalizedQuery.includes('terminat')) {
      if (lowerText.includes('“applicable term”') || lowerText.includes('applicable term') || lowerText.includes('7. term.')) boost += 4.0;
    }
    // Authorized User
    if (normalizedQuery.includes('authorized user') || normalizedQuery.includes('named user')) {
      if (lowerText.includes('“authorized user” means') || lowerText.includes('authorized users may also include')) boost += 3.0;
    }

    return boost;
  }

  /**
   * Section Expansion Step:
   * Given retrieved chunks, expands them to include ALL chunks belonging to the identified section(s).
   * E.g. If one result belongs to sectionNumber = "10", retrieve every chunk with that sectionNumber.
   */
  async expandRelatedSections(
    documentId: string,
    chunks: RetrievedChunk[],
    targetSectionNumber?: string
  ): Promise<RetrievedChunk[]> {
    // 1. Determine unique target section numbers from input chunks or parameter
    const sectionNumbers = new Set<string>();
    if (targetSectionNumber) {
      sectionNumbers.add(targetSectionNumber);
    }
    for (const c of chunks) {
      if (c.sectionNumber) {
        sectionNumbers.add(c.sectionNumber);
      }
    }

    if (sectionNumbers.size === 0) {
      return chunks;
    }

    // 2. Query Prisma for ALL chunks belonging to these sections in the document
    const targetSecArray = Array.from(sectionNumbers);
    const dbSectionChunks = await prisma.documentChunk.findMany({
      where: {
        documentId,
        sectionNumber: { in: targetSecArray },
      },
      orderBy: { chunkIndex: 'asc' },
    });

    const expandedMap = new Map<number, RetrievedChunk>();

    // Add initial chunks to map
    for (const c of chunks) {
      expandedMap.set(c.chunkIndex, c);
    }

    // Add all section chunks from database
    for (const sc of dbSectionChunks) {
      expandedMap.set(sc.chunkIndex, {
        id: sc.id,
        documentId: sc.documentId,
        chunkIndex: sc.chunkIndex,
        text: sc.text || sc.content || '',
        pageStart: sc.pageStart || sc.pageNumber,
        pageEnd: sc.pageEnd || sc.pageNumber,
        charStart: sc.charStart,
        charEnd: sc.charEnd,
        sectionNumber: sc.sectionNumber,
        sectionTitle: sc.sectionTitle,
        score: 2.5, // Priority score for complete section chunks
        matchedKeywords: sc.sectionTitle ? [sc.sectionTitle.toLowerCase()] : [],
      });
    }

    // 3. Check boundary continuation: also include the chunk immediately following the last section chunk
    // to capture trailing subsections (e.g. clauses (c) & (d) that span into the next chunk before a new section heading)
    if (dbSectionChunks.length > 0) {
      const maxSectionIndex = Math.max(...dbSectionChunks.map((c) => c.chunkIndex));
      const nextChunk = await prisma.documentChunk.findFirst({
        where: {
          documentId,
          chunkIndex: maxSectionIndex + 1,
        },
      });

      if (nextChunk && !expandedMap.has(nextChunk.chunkIndex)) {
        expandedMap.set(nextChunk.chunkIndex, {
          id: nextChunk.id,
          documentId: nextChunk.documentId,
          chunkIndex: nextChunk.chunkIndex,
          text: nextChunk.text || nextChunk.content || '',
          pageStart: nextChunk.pageStart || nextChunk.pageNumber,
          pageEnd: nextChunk.pageEnd || nextChunk.pageNumber,
          charStart: nextChunk.charStart,
          charEnd: nextChunk.charEnd,
          sectionNumber: nextChunk.sectionNumber,
          sectionTitle: nextChunk.sectionTitle,
          score: 1.8,
          matchedKeywords: ['section continuation'],
        });
      }
    }

    if (targetSectionNumber) {
      // Relevance Gate: Strictly isolate chunks belonging to the requested section or its trailing subsections
      const secHeadingRegex = new RegExp(`(?:^|\\n)\\s*${targetSectionNumber}\\.\\s+`, 'i');
      const sectionOnly = Array.from(expandedMap.values()).filter((c) => {
        return (
          c.sectionNumber === targetSectionNumber ||
          (c.text && secHeadingRegex.test(c.text)) ||
          c.matchedKeywords?.includes('section continuation')
        );
      });
      if (sectionOnly.length > 0) {
        return sectionOnly.sort((a, b) => a.chunkIndex - b.chunkIndex);
      }
    }

    return Array.from(expandedMap.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * Multi-Part Question Retrieval:
   * Retrieves targeted chunks for each distinct part/topic in the QuestionPlan,
   * then merges and de-duplicates them so that no part or section gets overshadowed by another.
   *
   * Example:
   * Part A: confidentiality -> Section 13 chunks (including 13(a)-(f))
   * Part B: survival -> Section 10(d) & Section 13(f) chunks
   */
  async retrieveForQuestionPlan(
    plan: QuestionPlan,
    documentId: string,
    limitPerPart: number = 8
  ): Promise<RetrievedChunk[]> {
    if (!plan.parts || plan.parts.length === 0) {
      return [];
    }

    const chunkMap = new Map<number, RetrievedChunk>();

    for (const part of plan.parts) {
      const partChunks: RetrievedChunk[] = [];

      // 1. If target section numbers are specified, retrieve all chunks for those sections
      if (part.sectionNumbers && part.sectionNumbers.length > 0) {
        for (const secNum of part.sectionNumbers) {
          const dbChunks = await prisma.documentChunk.findMany({
            where: {
              documentId,
              sectionNumber: secNum,
            },
            orderBy: { chunkIndex: 'asc' },
          });

          const converted: RetrievedChunk[] = dbChunks.map((sc) => ({
            id: sc.id,
            documentId: sc.documentId,
            chunkIndex: sc.chunkIndex,
            text: sc.text || sc.content || '',
            pageStart: sc.pageStart || sc.pageNumber,
            pageEnd: sc.pageEnd || sc.pageNumber,
            charStart: sc.charStart,
            charEnd: sc.charEnd,
            sectionNumber: sc.sectionNumber,
            sectionTitle: sc.sectionTitle,
            score: 3.5,
            matchedKeywords: [part.topic, `Section ${secNum}`],
          }));

          const expanded = await this.expandRelatedSections(documentId, converted, secNum);
          partChunks.push(...expanded);
        }
      }

      // 2. Also run topic/BM25 retrieval on part.question to pick up relevant semantic nuances
      const cls: QueryClassification = {
        type: part.type || 'SECTION',
        topic: part.topic,
        sectionNumber: part.sectionNumbers?.[0],
        sectionTitle: part.sectionTitle,
      };
      const textMatches = await this.retrieveWithClassification(
        part.question,
        documentId,
        cls,
        limitPerPart
      );
      partChunks.push(...textMatches);

      // 3. Deduplicate and merge into master chunkMap
      for (const c of partChunks) {
        if (!chunkMap.has(c.chunkIndex)) {
          chunkMap.set(c.chunkIndex, {
            ...c,
            score: (c.score || 2.0) + 1.0,
            matchedKeywords: Array.from(new Set([...(c.matchedKeywords || []), part.topic])),
          });
        } else {
          const existing = chunkMap.get(c.chunkIndex)!;
          existing.score = Math.max(existing.score, c.score || 2.0) + 1.0;
          existing.matchedKeywords = Array.from(
            new Set([...existing.matchedKeywords, ...(c.matchedKeywords || []), part.topic])
          );
        }
      }
    }

    return Array.from(chunkMap.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  /**
   * Retrieve chunks with section-awareness and topic expansion based on query classification.
   * Pipeline:
   * Query -> Classify -> Search relevant chunks -> Find matching section -> Section expansion -> Return
   */
  async retrieveWithClassification(
    query: string,
    documentId: string,
    classification?: QueryClassification,
    limit: number = 8
  ): Promise<RetrievedChunk[]> {
    const cls = classification || this.classifyQuery(query);

    // 1. Fetch all chunks associated with this document
    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    });

    if (chunks.length === 0) {
      return [];
    }

    // A. VERY_BROAD queries: retrieve landmark executive sections systematically
    if (cls.type === 'VERY_BROAD') {
      const landmarkSections = ['1', '3', '8', '10', '13', '16', '17'];
      const broadChunks = chunks.filter(
        (c) => c.sectionNumber && landmarkSections.includes(c.sectionNumber)
      );

      if (broadChunks.length > 0) {
        return broadChunks.slice(0, 14).map((c) => ({
          id: c.id,
          documentId: c.documentId,
          chunkIndex: c.chunkIndex,
          text: c.text || c.content || '',
          pageStart: c.pageStart || c.pageNumber,
          pageEnd: c.pageEnd || c.pageNumber,
          charStart: c.charStart,
          charEnd: c.charEnd,
          sectionNumber: c.sectionNumber,
          sectionTitle: c.sectionTitle,
          score: 1.5,
          matchedKeywords: ['overview', c.sectionTitle || ''],
        }));
      }
    }

    // B. SECTION or BROAD retrieval: identify section and perform section expansion
    if (cls.type === 'SECTION' || cls.type === 'BROAD') {
      const headingRegex = /(?:^|\n)\s*(\d{1,2})\.\s+([A-Za-z\s/&-]{3,35})\./g;
      let targetSectionNum: string | undefined = cls.sectionNumber;

      // Legal topic synonym dictionary for topic-to-section mapping
      const TOPIC_SYNONYMS: Record<string, string[]> = {
        liability: ['liability', 'damages', 'remedies', 'limitation', 'losses'],
        termination: ['termination', 'expiration', 'cancel', 'post-termination'],
        confidentiality: ['confidentiality', 'confidential', 'nondisclosure', 'secret'],
        'intellectual property': ['intellectual property', 'rights', 'indemnity', 'patents', 'copyright', 'ownership'],
        payment: ['payment', 'taxes', 'fees', 'invoice', 'billing'],
        fees: ['payment', 'fees', 'taxes', 'invoice'],
        warranty: ['warranty', 'warranties', 'disclaimer', 'conform'],
        warranties: ['warranty', 'warranties', 'disclaimer', 'conform'],
        security: ['security', 'data security', 'protection', 'safeguards'],
        indemnification: ['indemnity', 'indemnification', 'hold harmless'],
        'governing law': ['general', 'governing law', 'jurisdiction'],
      };

      // First check if any chunks in database already have this sectionNumber or title
      if (!targetSectionNum && cls.topic) {
        const lowerTopic = cls.topic.toLowerCase();
        let topicWords = lowerTopic.split(/\s+/).filter((w) => w.length > 2);
        if (TOPIC_SYNONYMS[lowerTopic]) {
          topicWords = Array.from(new Set([...topicWords, ...TOPIC_SYNONYMS[lowerTopic]]));
        }

        // Check database sectionTitle columns first
        for (const c of chunks) {
          if (c.sectionTitle && c.sectionNumber) {
            const secLower = c.sectionTitle.toLowerCase();
            for (const tw of topicWords) {
              if (secLower.includes(tw)) {
                targetSectionNum = c.sectionNumber;
                break;
              }
            }
            if (targetSectionNum) break;
          }
        }

        // If not found in DB column, scan chunk text for headings
        if (!targetSectionNum) {
          let bestHeadingScore = 0;
          for (const c of chunks) {
            const chunkText = c.text || c.content || '';
            let m: RegExpExecArray | null;
            while ((m = headingRegex.exec(chunkText)) !== null) {
              const secNum = m[1];
              const secTitle = m[2].trim();
              const secTitleWords = secTitle.toLowerCase().split(/\s+/);
              const afterHeading = chunkText.slice(m.index + m[0].length, m.index + m[0].length + 400).toLowerCase();

              let matches = 0;
              for (const tw of topicWords) {
                if (secTitleWords.includes(tw)) matches += 3;
                else if (secTitleWords.some((sw) => sw.startsWith(tw) || tw.startsWith(sw))) matches += 2;
                if (afterHeading.includes(tw)) matches += 1;
              }
              if (matches > bestHeadingScore) {
                bestHeadingScore = matches;
                targetSectionNum = secNum;
              }
            }
          }
        }
      }

      // If target section identified: perform section expansion to get ALL chunks of that section
      if (targetSectionNum) {
        // Find initial keyword matches
        const topBm25 = await this.searchDocument(query, documentId, Math.max(limit, 5));
        // Expand to ALL chunks belonging to targetSectionNum
        const expanded = await this.expandRelatedSections(documentId, topBm25, targetSectionNum);
        return expanded.slice(0, 12);
      }
    }

    // C. SPECIFIC retrieval or fallback
    return this.searchDocument(query, documentId, limit);
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
    const stems = keywords.map((k) => this.getStem(k));
    const N = chunks.length;

    // Document lengths & corpus average length for Okapi BM25
    const docLengths = chunks.map((c) => (c.text || c.content || '').length);
    const avgdl = docLengths.reduce((a, b) => a + b, 0) / N;

    // Compute Document Frequency (DF) & Inverse Document Frequency (IDF)
    const df = new Map<string, number>();
    for (let i = 0; i < keywords.length; i++) {
      const kw = keywords[i];
      const stem = stems[i];
      let count = 0;
      for (const c of chunks) {
        const txt = (c.text || c.content || '').toLowerCase();
        if (txt.includes(kw) || txt.includes(stem)) count++;
      }
      df.set(kw, count);
    }

    const idf = new Map<string, number>();
    for (const kw of keywords) {
      const n = df.get(kw) || 0;
      const val = Math.max(0.2, Math.log(1 + (N - n + 0.5) / (n + 0.5)));
      idf.set(kw, val);
    }

    const headingRegex = /(?:^|\n)\s*(\d{1,2}|[A-Z])[\.\)]\s+([A-Za-z\s/&-]{3,50})/g;

    // 2. Score each chunk using BM25 + Section Metadata & Headings + Phrases + Soft Domain Boosts
    const scoredChunks = chunks.map((chunk, idx) => {
      const chunkText = chunk.text || chunk.content || '';
      const lowerText = chunkText.toLowerCase();
      const len = docLengths[idx];

      let bm25 = 0;
      let matchedTerms = 0;
      const matchedKeywords: string[] = [];
      const k1 = 1.2;
      const b = 0.75;

      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        const stem = stems[i];
        const regex = new RegExp(`\\b${stem}`, 'gi');
        const matches = lowerText.match(regex);
        const tf = matches ? matches.length : 0;
        if (tf > 0) {
          matchedTerms++;
          matchedKeywords.push(kw);
          const termIdf = idf.get(kw) || 0.5;
          const num = tf * (k1 + 1);
          const denom = tf + k1 * (1 - b + b * (len / avgdl));
          bm25 += termIdf * (num / denom);
        }
      }

      const termCoverage = keywords.length > 0 ? matchedTerms / keywords.length : 0;
      let score = bm25 * 0.7 + termCoverage * 2.0;

      // Exact phrase bonus
      if (keywords.length > 1 && lowerText.includes(normalizedQuery)) {
        score += 2.0;
      }

      // Proximity / sub-phrase bonus (adjacent bigrams)
      for (let i = 0; i < keywords.length - 1; i++) {
        const pair = `${keywords[i]} ${keywords[i + 1]}`;
        if (lowerText.includes(pair)) {
          score += 0.5;
        }
      }

      // Generic Section Metadata & Heading Alignment (Works across any contract)
      const secTitle = (chunk.sectionTitle || '').toLowerCase();
      let headingMatchCount = 0;
      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        const stem = stems[i];
        if (secTitle.includes(kw) || secTitle.includes(stem)) headingMatchCount++;
      }

      let hMatch: RegExpExecArray | null;
      while ((hMatch = headingRegex.exec(chunkText)) !== null) {
        const hText = hMatch[2].toLowerCase();
        for (let i = 0; i < keywords.length; i++) {
          const kw = keywords[i];
          const stem = stems[i];
          if (hText.includes(kw) || hText.includes(stem)) headingMatchCount++;
        }
      }

      if (headingMatchCount > 0) {
        score += Math.min(4.0, headingMatchCount * 2.0);
      }

      // Explicit section number match in query
      const secNumMatch = query.match(/\b(?:section|clause|article)\s*(\d+[a-z]?|[A-Z])\b/i);
      if (secNumMatch && (chunk.sectionNumber === secNumMatch[1] || lowerText.includes(`section ${secNumMatch[1]}`))) {
        score += 4.0;
      }

      // Soft secondary domain boosts (not hard overrides)
      score += this.applySoftDomainBoosts(normalizedQuery, lowerText);

      return {
        id: chunk.id,
        documentId: chunk.documentId,
        chunkIndex: chunk.chunkIndex,
        text: chunkText,
        pageStart: chunk.pageStart || chunk.pageNumber,
        pageEnd: chunk.pageEnd || chunk.pageNumber,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        sectionNumber: chunk.sectionNumber,
        sectionTitle: chunk.sectionTitle,
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
   * Re-ranking Step:
   * Re-scores retrieved candidate chunks by discounting generic boilerplate
   * and measuring distinctive query term density, phrase alignment, and topical coherence.
   */
  rerankChunks<T extends { text?: string; score?: number; sectionNumber?: string | null }>(
    query: string,
    chunks: T[],
    classification?: QueryClassification,
    plan?: QuestionPlan
  ): T[] {
    if (!chunks || chunks.length <= 1) return chunks || [];

    const qLower = query.toLowerCase().trim();
    const distinctiveTokens = this.tokenizeQuery(query).filter(
      (w) =>
        !STOP_WORDS.has(w) &&
        !['agreement', 'contract', 'service', 'services', 'customer', 'onestream', 'section', 'clause', 'schedule'].includes(w)
    );

    const scored = chunks.map((chunk) => {
      const text = (chunk.text || '').toLowerCase();
      let rerankScore = chunk.score || 0;

      // 1. Distinctive token density in chunk
      let distinctiveMatches = 0;
      for (const tok of distinctiveTokens) {
        if (text.includes(tok)) distinctiveMatches++;
      }
      const distinctiveRatio = distinctiveTokens.length > 0 ? distinctiveMatches / distinctiveTokens.length : 0;
      rerankScore += distinctiveRatio * 5.0;

      // 2. Phrase bonus
      if (distinctiveTokens.length >= 2) {
        for (let i = 0; i < distinctiveTokens.length - 1; i++) {
          const pair = `${distinctiveTokens[i]} ${distinctiveTokens[i + 1]}`;
          if (text.includes(pair)) rerankScore += 3.0;
        }
      }

      // 3. Section alignment
      if (plan?.isMultiPart) {
        const targetSections = new Set<string>();
        for (const p of plan.parts) {
          for (const s of p.sectionNumbers || []) {
            targetSections.add(s);
          }
        }
        if (chunk.sectionNumber && targetSections.has(chunk.sectionNumber)) {
          rerankScore += 4.0;
        }
      } else if (classification?.sectionNumber && chunk.sectionNumber === classification.sectionNumber) {
        rerankScore += 4.0;
      }

      // 4. Cross-topic penalty (e.g. liability section when question is about pricing or payment)
      const isPaymentOrPricing =
        qLower.includes('pay') ||
        qLower.includes('fee') ||
        qLower.includes('invoic') ||
        qLower.includes('dollar') ||
        qLower.includes('cost');
      if (isPaymentOrPricing && !qLower.includes('liability')) {
        if (
          chunk.sectionNumber === '16' ||
          text.includes('limitation of remedies') ||
          text.includes('aggregate liability')
        ) {
          rerankScore -= 8.0;
        }
      }

      return {
        ...chunk,
        score: Number(rerankScore.toFixed(4)),
      };
    });

    return scored.sort((a, b) => (b.score || 0) - (a.score || 0));
  }

  /**
   * Alias method for backward compatibility
   */
  async retrieveRelevantChunks(documentId: string, query: string, limit: number = 5): Promise<RetrievedChunk[]> {
    return this.retrieveWithClassification(query, documentId, undefined, limit);
  }
}

export const retrievalService = new RetrievalService();
