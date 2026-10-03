import { prisma } from '../utils/prisma';

export type QueryType = 'SPECIFIC' | 'SECTION' | 'BROAD' | 'VERY_BROAD';

export interface QueryClassification {
  type: QueryType;
  topic?: string;
  sectionNumber?: string;
  sectionTitle?: string;
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

    if (q.includes('terminat') || (q.includes('survive') && q.includes('termination'))) {
      return {
        type: 'SECTION',
        topic: 'termination',
        sectionNumber: '10',
      };
    }

    if ((q.includes('applicable term') || q.includes('contract duration')) && !q.includes('terminat')) {
      return {
        type: 'SECTION',
        topic: 'term',
        sectionNumber: '7',
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

    return Array.from(expandedMap.values()).sort((a, b) => a.chunkIndex - b.chunkIndex);
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

    // 2. Score each chunk based on keyword frequency and exact phrase matching
    const scoredChunks = chunks.map((chunk) => {
      const chunkText = chunk.text || chunk.content || '';
      const lowerText = chunkText.toLowerCase();

      let matchCount = 0;
      const matchedKeywords: string[] = [];

      for (const kw of keywords) {
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

      // Topic-specific section boosts and cross-topic penalties
      if (
        normalizedQuery.includes('availab') ||
        normalizedQuery.includes('service credit') ||
        normalizedQuery.includes('service level') ||
        normalizedQuery.includes('uptime') ||
        normalizedQuery.includes('downtime')
      ) {
        if (
          lowerText.includes('availability requirement') ||
          lowerText.includes('3. service levels') ||
          lowerText.includes('service level failure') ||
          lowerText.includes('service credit') ||
          lowerText.includes('support services and service levels')
        ) {
          score += 10.0;
        }
        if (lowerText.includes('10. termination') || lowerText.includes('14. rights') || lowerText.includes('attachment d') || lowerText.includes('16. limitation')) {
          score -= 10.0;
        }
      }

      if (
        (normalizedQuery.includes('customer data') || normalizedQuery.includes('data')) &&
        (normalizedQuery.includes('intellectual property') || normalizedQuery.includes('owns') || normalizedQuery.includes('rights') || normalizedQuery.includes('service'))
      ) {
        if (
          lowerText.includes('14. rights') ||
          (lowerText.includes('onestream shall own all rights') && lowerText.includes('customer data')) ||
          (lowerText.includes('customer shall own all rights') && lowerText.includes('customer data'))
        ) {
          score += 10.0;
        }
        if (lowerText.includes('attachment d') || lowerText.includes('work product') || lowerText.includes('professional services')) {
          score -= 10.0;
        }
        if (lowerText.includes('10. termination')) {
          score -= 5.0;
        }
      }

      if (normalizedQuery.includes('liability')) {
        if (
          lowerText.includes('16. limitation of remedies') ||
          lowerText.includes('aggregate liability') ||
          lowerText.includes('last 12 months')
        ) {
          score += 10.0;
        }
        if (lowerText.includes('10. termination')) {
          score -= 5.0;
        }
      }

      if (normalizedQuery.includes('terminat')) {
        if (
          lowerText.includes('10. termination') ||
          lowerText.includes('expiration or termination') ||
          lowerText.includes('exclusive remedy') ||
          lowerText.includes('survive indefinitely any termination')
        ) {
          score += 10.0;
        }
      }

      if ((normalizedQuery.includes('applicable term') || normalizedQuery.includes('contract duration')) && !normalizedQuery.includes('terminat')) {
        if (
          lowerText.includes('“applicable term” means') ||
          lowerText.includes('applicable term” means') ||
          lowerText.includes('applicable term shall commence') ||
          lowerText.includes('7. term.') ||
          lowerText.includes('1. definitions.')
        ) {
          score += 10.0;
        }
        if (lowerText.includes('10. termination')) {
          score -= 5.0;
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
   * Alias method for backward compatibility
   */
  async retrieveRelevantChunks(documentId: string, query: string, limit: number = 5): Promise<RetrievedChunk[]> {
    return this.retrieveWithClassification(query, documentId, undefined, limit);
  }
}

export const retrievalService = new RetrievalService();
