import { prisma } from '../utils/prisma';
import { aiService } from './ai.service';
import { citationService } from './citation.service';
import { generateText } from 'ai';

export type SignificanceLevel = 'High' | 'Medium' | 'Low';
export type ChangeType = 'modified' | 'added' | 'removed' | 'unchanged';

export interface ExtractedClause {
  title: string;
  number?: string;
  text: string;
}

export interface ClauseCitation {
  quote: string;
  page?: number | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  startOffset?: number | null;
  endOffset?: number | null;
  verified: boolean;
}

export interface ClauseComparison {
  id: string;
  clause: string;
  oldText: string | null;
  newText: string | null;
  changeType: ChangeType;
  summary: string;
  significance: SignificanceLevel;
  oldCitation?: ClauseCitation | null;
  newCitation?: ClauseCitation | null;
}

export interface ComparisonResult {
  documentA: { id: string; title: string; fileName: string };
  documentB: { id: string; title: string; fileName: string };
  executiveSummary: string;
  totalChanges: number;
  counts: {
    high: number;
    medium: number;
    low: number;
    added: number;
    removed: number;
    modified: number;
  };
  comparisons: ClauseComparison[];
}

export class ComparisonService {
  /**
   * Extracts distinct clauses or sections from raw contract text
   */
  extractClauses(text: string): ExtractedClause[] {
    if (!text || !text.trim()) return [];

    // Clean page markers
    const cleanText = text.replace(/\[\[PAGE_\d+\]\]/g, '').trim();

    // Regex matching numbered clauses or major legal headings:
    // e.g. "1. GRANT OF LICENSE", "SECTION 2 - PAYMENT", "Article III: TERM", "8. LIMITATION OF LIABILITY"
    const headingRegex =
      /(?:^|\n+)(?:(?:SECTION|ARTICLE|CLAUSE)\s+[\dIVXLCDM]+[:\.\s\-–—]+[^\n]{2,60}|(?:\d+(?:\.\d+)*\.?|\(\d+\))\s+[A-Z][^\n]{2,60}|[A-Z0-9\s,\-–—]{4,50}:)(?=\n|$)/gi;

    const matches = [...cleanText.matchAll(headingRegex)];

    if (matches.length < 2) {
      // Fallback: split by double newlines or numbered lines
      const paragraphs = cleanText
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 20);

      return paragraphs.map((p, idx) => {
        const firstLine = p.split('\n')[0].trim();
        const title = firstLine.length < 50 ? firstLine : `Section ${idx + 1}`;
        return {
          title,
          number: String(idx + 1),
          text: p,
        };
      });
    }

    const clauses: ExtractedClause[] = [];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const matchIndex = match.index ?? 0;
      const heading = match[0].trim();

      const startIndex = matchIndex + match[0].length;
      const endIndex =
        i + 1 < matches.length && matches[i + 1].index !== undefined
          ? matches[i + 1].index!
          : cleanText.length;

      const body = cleanText.slice(startIndex, endIndex).trim();
      const numMatch = heading.match(/^(\d+|\b[IVXLCDM]+\b)/i);

      clauses.push({
        title: heading.replace(/^[\r\n]+/, '').trim(),
        number: numMatch ? numMatch[1] : String(i + 1),
        text: body ? `${heading}\n${body}` : heading,
      });
    }

    return clauses;
  }

  /**
   * Matches corresponding clauses between Document A and Document B
   */
  matchClauses(
    clausesA: ExtractedClause[],
    clausesB: ExtractedClause[]
  ): Array<{
    title: string;
    clauseA?: ExtractedClause;
    clauseB?: ExtractedClause;
  }> {
    const matched: Array<{
      title: string;
      clauseA?: ExtractedClause;
      clauseB?: ExtractedClause;
    }> = [];

    const usedB = new Set<number>();

    for (const a of clausesA) {
      const normTitleA = this.normalizeTitle(a.title);

      // 1. Try exact title / normalized title match
      let bestBIdx = -1;
      let highestSimilarity = 0;

      for (let bIdx = 0; bIdx < clausesB.length; bIdx++) {
        if (usedB.has(bIdx)) continue;
        const b = clausesB[bIdx];
        const normTitleB = this.normalizeTitle(b.title);

        if (normTitleA && normTitleB && normTitleA === normTitleB) {
          bestBIdx = bIdx;
          highestSimilarity = 1.0;
          break;
        }

        // Title token overlap
        const similarity = this.calculateTitleSimilarity(a.title, b.title);
        if (similarity > 0.55 && similarity > highestSimilarity) {
          highestSimilarity = similarity;
          bestBIdx = bIdx;
        }
      }

      // 2. If match found
      if (bestBIdx !== -1) {
        usedB.add(bestBIdx);
        matched.push({
          title: a.title,
          clauseA: a,
          clauseB: clausesB[bestBIdx],
        });
      } else {
        // Clause removed in B
        matched.push({
          title: a.title,
          clauseA: a,
        });
      }
    }

    // 3. Any remaining clauses in B were added in B
    for (let bIdx = 0; bIdx < clausesB.length; bIdx++) {
      if (!usedB.has(bIdx)) {
        matched.push({
          title: clausesB[bIdx].title,
          clauseB: clausesB[bIdx],
        });
      }
    }

    return matched;
  }

  /**
   * Independently verifies and locates a substantive quote for a clause against the source document.
   */
  extractClauseCitation(
    clauseText: string | null,
    fullDocText: string,
    chunks?: Array<{ text?: string; content?: string | null; pageStart?: number | null; pageEnd?: number | null; pageNumber?: number | null }>
  ): ClauseCitation | null {
    if (!clauseText || !clauseText.trim()) return null;

    // Clean leading clause headings (e.g., "4. LIMITATION OF LIABILITY\n")
    const body = clauseText
      .replace(/^(?:(?:\d+\.|\([a-z\d]+\))\s*[A-Z\s]{3,50}\n+|[A-Z\s]{4,50}:?\n+)/i, '')
      .trim();
    const candidateText = body || clauseText.trim();

    // Split into sentences
    const sentences = candidateText
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20);

    // Prefer sentence containing financial terms, percentages, or time deadlines if present
    const distinctiveSentence = sentences.find((s) =>
      /(?:AED|USD|EUR|GBP|[$€£]|\b\d+%\b|\b\d+\s*days?\b|\bliabilit|\bterminat|\bfee\b|\bwarrant|\bgovern|\bprotect)/i.test(s)
    );

    const candidateQuote = (distinctiveSentence || sentences[0] || candidateText.slice(0, 200)).trim();

    const loc = citationService.findQuote(candidateQuote, fullDocText);

    let matchedChunk: any = null;
    if (chunks && chunks.length > 0) {
      for (const ch of chunks) {
        const cText = ch.text || ch.content || '';
        if (
          cText.includes(candidateQuote) ||
          (loc.found && loc.exactQuote && cText.includes(loc.exactQuote))
        ) {
          matchedChunk = ch;
          break;
        }
      }
    }

    const page =
      (matchedChunk && (matchedChunk.pageStart || matchedChunk.pageNumber)) ||
      loc.pageStart ||
      1;

    return {
      quote: loc.found && loc.exactQuote ? loc.exactQuote : candidateQuote,
      page: loc.found ? page : null,
      pageStart: loc.found ? page : null,
      pageEnd: (matchedChunk && matchedChunk.pageEnd) || loc.pageEnd || page,
      startOffset: loc.found ? loc.startOffset : null,
      endOffset: loc.found ? loc.endOffset : null,
      verified: loc.found,
    };
  }

  /**
   * Compares two contract documents and produces substantive clause-level differences.
   */
  async compare(
    docA: { id: string; title: string; fileName: string; text: string; chunks?: any[] },
    docB: { id: string; title: string; fileName: string; text: string; chunks?: any[] }
  ): Promise<ComparisonResult> {
    const clausesA = this.extractClauses(docA.text);
    const clausesB = this.extractClauses(docB.text);

    const matchedPairs = this.matchClauses(clausesA, clausesB);
    const comparisons: ClauseComparison[] = [];

    let countHigh = 0;
    let countMedium = 0;
    let countLow = 0;
    let countAdded = 0;
    let countRemoved = 0;
    let countModified = 0;

    for (let i = 0; i < matchedPairs.length; i++) {
      const pair = matchedPairs[i];
      const id = `change-${i + 1}`;

      if (pair.clauseA && !pair.clauseB) {
        // Clause was removed
        const sig: SignificanceLevel = this.detectSignificance(pair.clauseA.text, '', 'removed');
        const oldCitation = this.extractClauseCitation(pair.clauseA.text, docA.text, docA.chunks);
        comparisons.push({
          id,
          clause: pair.title,
          oldText: pair.clauseA.text,
          newText: null,
          changeType: 'removed',
          summary: `Clause "${pair.title}" present in ${docA.title} was completely removed in ${docB.title}.`,
          significance: sig,
          oldCitation,
          newCitation: null,
        });
        countRemoved++;
        if (sig === 'High') countHigh++;
        else if (sig === 'Medium') countMedium++;
        else countLow++;
      } else if (!pair.clauseA && pair.clauseB) {
        // Clause was added
        const sig: SignificanceLevel = this.detectSignificance('', pair.clauseB.text, 'added');
        const newCitation = this.extractClauseCitation(pair.clauseB.text, docB.text, docB.chunks);
        comparisons.push({
          id,
          clause: pair.title,
          oldText: null,
          newText: pair.clauseB.text,
          changeType: 'added',
          summary: `New clause "${pair.title}" was introduced in ${docB.title}.`,
          significance: sig,
          oldCitation: null,
          newCitation,
        });
        countAdded++;
        if (sig === 'High') countHigh++;
        else if (sig === 'Medium') countMedium++;
        else countLow++;
      } else if (pair.clauseA && pair.clauseB) {
        // Both exist: check if modified
        const textA = pair.clauseA.text;
        const textB = pair.clauseB.text;

        const isUnchanged = this.normalizeText(textA) === this.normalizeText(textB);
        const oldCitation = this.extractClauseCitation(textA, docA.text, docA.chunks);
        const newCitation = this.extractClauseCitation(textB, docB.text, docB.chunks);

        if (isUnchanged) {
          // Unchanged clause
          comparisons.push({
            id,
            clause: pair.title,
            oldText: textA,
            newText: textB,
            changeType: 'unchanged',
            summary: 'No substantive changes. Provisions are identical.',
            significance: 'Low',
            oldCitation,
            newCitation,
          });
        } else {
          // Modified clause
          const diffSummary = this.generateSubstantiveSummary(pair.title, textA, textB);
          const sig = diffSummary.significance;

          comparisons.push({
            id,
            clause: pair.title,
            oldText: textA,
            newText: textB,
            changeType: 'modified',
            summary: diffSummary.summary,
            significance: sig,
            oldCitation,
            newCitation,
          });

          countModified++;
          if (sig === 'High') countHigh++;
          else if (sig === 'Medium') countMedium++;
          else countLow++;
        }
      }
    }

    // Active changes
    const activeChanges = comparisons.filter((c) => c.changeType !== 'unchanged');

    // Generate executive summary
    let executiveSummary = this.generateExecutiveSummary(
      docA.title,
      docB.title,
      countHigh,
      countMedium,
      countLow,
      activeChanges
    );

    // If AI is configured, enrich the executive summary
    if (aiService.isConfigured() && activeChanges.length > 0) {
      try {
        const enrichedSummary = await this.enrichExecutiveSummaryWithAI(
          docA.title,
          docB.title,
          activeChanges
        );
        if (enrichedSummary) {
          executiveSummary = enrichedSummary;
        }
      } catch (aiErr) {
        // Graceful fallback to deterministic summary
      }
    }

    return {
      documentA: { id: docA.id, title: docA.title, fileName: docA.fileName },
      documentB: { id: docB.id, title: docB.title, fileName: docB.fileName },
      executiveSummary,
      totalChanges: activeChanges.length,
      counts: {
        high: countHigh,
        medium: countMedium,
        low: countLow,
        added: countAdded,
        removed: countRemoved,
        modified: countModified,
      },
      comparisons,
    };
  }

  /**
   * Deterministic substantive summary generator
   */
  generateSubstantiveSummary(
    clauseTitle: string,
    textA: string,
    textB: string
  ): { summary: string; significance: SignificanceLevel } {
    // 1. Detect Financial & Monetary Changes (e.g. AED 100,000 -> AED 1,000,000 or $50,000 -> $1,000,000)
    const moneyRegex =
      /(?:AED|USD|EUR|GBP|[$€£])\s*[\d,]+(?:\.\d+)?|\b[\d,]+(?:\.\d+)?\s*(?:AED|USD|EUR|GBP|dollars?)/gi;
    const amountsA = textA.match(moneyRegex) || [];
    const amountsB = textB.match(moneyRegex) || [];

    const a0 = amountsA[0];
    const b0 = amountsB[0];
    if (a0 && b0 && a0.trim() !== b0.trim()) {
      return {
        summary: `Financial terms in "${clauseTitle}" changed from ${a0.trim()} to ${b0.trim()}.`,
        significance: 'High',
      };
    }

    // 2. Detect Percentages (e.g. 5% -> 15%)
    const pctA = textA.match(/\b\d+(?:\.\d+)?%/g) || [];
    const pctB = textB.match(/\b\d+(?:\.\d+)?%/g) || [];
    const p0A = pctA[0];
    const p0B = pctB[0];
    if (p0A && p0B && p0A !== p0B) {
      return {
        summary: `Percentage rate or threshold in "${clauseTitle}" changed from ${p0A} to ${p0B}.`,
        significance: 'High',
      };
    }

    // 3. Detect Time / Notice Period Changes (e.g. 60 days -> 5 days)
    const timeRegex = /\b\d+\s*(?:\(\d+\)\s*)?(?:business\s+)?(?:days?|months?|years?|weeks?|hours?)/gi;
    const daysA = textA.match(timeRegex) || [];
    const daysB = textB.match(timeRegex) || [];
    const d0A = daysA[0];
    const d0B = daysB[0];

    if (d0A && d0B && d0A.toLowerCase() !== d0B.toLowerCase()) {
      return {
        summary: `Time period or notice deadline changed from "${d0A.trim()}" to "${d0B.trim()}".`,
        significance: 'High',
      };
    }

    // 4. Check for High-Impact Legal Topics
    const lowerTitle = clauseTitle.toLowerCase();
    const isHighImpactTopic =
      lowerTitle.includes('liability') ||
      lowerTitle.includes('indemn') ||
      lowerTitle.includes('terminat') ||
      lowerTitle.includes('governing law') ||
      lowerTitle.includes('jurisdiction') ||
      lowerTitle.includes('arbitration') ||
      lowerTitle.includes('exclusiv') ||
      lowerTitle.includes('payment') ||
      lowerTitle.includes('fee') ||
      lowerTitle.includes('warranty') ||
      lowerTitle.includes('damages');

    if (isHighImpactTopic) {
      // Look for specific shifts in words
      const lowerA = textA.toLowerCase();
      const lowerB = textB.toLowerCase();

      if (!lowerA.includes('consequential') && lowerB.includes('consequential')) {
        return {
          summary: `Consequential / indirect damages provisions added in "${clauseTitle}".`,
          significance: 'High',
        };
      }
      if (lowerA.includes('sole remedy') && !lowerB.includes('sole remedy')) {
        return {
          summary: `Exclusive / sole remedy limitation removed from "${clauseTitle}".`,
          significance: 'High',
        };
      }
      if (!lowerA.includes('gross negligence') && lowerB.includes('gross negligence')) {
        return {
          summary: `Gross negligence exception introduced in "${clauseTitle}".`,
          significance: 'High',
        };
      }

      return {
        summary: `Substantive alterations made to ${clauseTitle}, impacting legal rights, liabilities, or remedies.`,
        significance: 'High',
      };
    }

    // 5. Medium impact topics
    const isMediumTopic =
      lowerTitle.includes('confident') ||
      lowerTitle.includes('audit') ||
      lowerTitle.includes('notice') ||
      lowerTitle.includes('intellectual property') ||
      lowerTitle.includes('ip') ||
      lowerTitle.includes('assignment') ||
      lowerTitle.includes('compliance') ||
      lowerTitle.includes('force majeure');

    if (isMediumTopic) {
      return {
        summary: `Contractual obligations or compliance requirements updated in ${clauseTitle}.`,
        significance: 'Medium',
      };
    }

    // 6. Stylistic / Low changes
    return {
      summary: `Minor wording or stylistic adjustments made in ${clauseTitle}.`,
      significance: 'Low',
    };
  }

  detectSignificance(textA: string, textB: string, changeType: ChangeType): SignificanceLevel {
    const text = (textA + ' ' + textB).toLowerCase();

    if (
      text.includes('liability') ||
      text.includes('indemn') ||
      text.includes('terminat') ||
      text.includes('governing law') ||
      text.includes('jurisdiction') ||
      text.includes('$') ||
      text.includes('aed') ||
      text.includes('fee') ||
      text.includes('exclusive')
    ) {
      return 'High';
    }

    if (
      text.includes('confidential') ||
      text.includes('audit') ||
      text.includes('notice') ||
      text.includes('assignment') ||
      text.includes('compliance')
    ) {
      return 'Medium';
    }

    return changeType === 'added' || changeType === 'removed' ? 'Medium' : 'Low';
  }

  private generateExecutiveSummary(
    titleA: string,
    titleB: string,
    high: number,
    medium: number,
    low: number,
    changes: ClauseComparison[]
  ): string {
    const total = high + medium + low;
    if (total === 0) {
      return `Both versions of the contract (${titleA} and ${titleB}) are substantively identical. No material changes were detected.`;
    }

    const highSummaries = changes
      .filter((c) => c.significance === 'High')
      .map((c) => c.summary)
      .slice(0, 3)
      .join(' ');

    return `Comparative analysis between "${titleA}" and "${titleB}" identified ${total} clause-level differences (${high} High, ${medium} Medium, and ${low} Low significance). ${
      high > 0 ? `Key high-impact changes include: ${highSummaries}` : 'All modifications are moderate or stylistic.'
    }`;
  }

  private async enrichExecutiveSummaryWithAI(
    titleA: string,
    titleB: string,
    changes: ClauseComparison[]
  ): Promise<string | null> {
    const client = aiService.getClient();
    const model = aiService.getModel();

    const changeBullets = changes
      .slice(0, 8)
      .map((c) => `- [${c.significance}] ${c.clause} (${c.changeType}): ${c.summary}`)
      .join('\n');

    const prompt = `You are a senior legal counsel reviewing two versions of a contract: Version 1 ("${titleA}") and Version 2 ("${titleB}").
The following clause-level changes were identified:
${changeBullets}

Write a concise 2-3 sentence executive summary explaining what changed in substance and the practical business/legal impact for the parties.
Be direct, professional, and focus on financial thresholds, liability, and rights.`;

    const { text } = await generateText({
      model: client(model),
      prompt,
    });

    return text.trim() || null;
  }

  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/^[\d\.\(\)\s\-–—]+/, '')
      .replace(/^(section|article|clause)\s+[\dIVXLCDM]+[:\.\s\-–—]*/i, '')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  private calculateTitleSimilarity(titleA: string, titleB: string): number {
    const wordsA = new Set(this.normalizeTitle(titleA).split(/\s+/).filter((w) => w.length > 2));
    const wordsB = new Set(this.normalizeTitle(titleB).split(/\s+/).filter((w) => w.length > 2));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let matches = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) matches++;
    }

    return (2 * matches) / (wordsA.size + wordsB.size);
  }

  private normalizeText(raw: string): string {
    return raw
      .replace(/\s+/g, ' ')
      .replace(/[“"]/g, '"')
      .replace(/[’']/g, "'")
      .trim();
  }
}

export const comparisonService = new ComparisonService();
