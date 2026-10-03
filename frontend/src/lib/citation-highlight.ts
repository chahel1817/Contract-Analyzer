/**
 * Citation Highlighting Engine for PDF.js / react-pdf text layer
 * Handles:
 * - Multi-line quotes (spanning multiple <span> elements)
 * - Cross-page quotes (prefix on pageStart, suffix on pageEnd)
 * - Duplicate quotes (resolving exact occurrence using startOffset / occurrenceIndex)
 */

export interface HighlightTarget {
  quote: string;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
  occurrenceIndex?: number;
}

export interface HighlightResult {
  found: boolean;
  highlightedCount: number;
  isPartial: boolean;
  isCrossPage: boolean;
  firstMarkElement?: HTMLElement;
}

/**
 * Normalizes text while maintaining a map from normalized character index to raw string index
 */
export function normalizeWithMap(raw: string): { normalized: string; indexMap: number[] } {
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
 * Removes any existing citation highlight marks from the page container
 */
export function clearExistingHighlights(container: HTMLElement): void {
  const marks = Array.from(container.querySelectorAll('mark.contract-citation-highlight'));
  for (const mark of marks) {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    }
  }
}

// Clean a single word for robust comparison
function cleanWord(w: string): string {
  return w
    .toLowerCase()
    .replace(/[’‘'"`“”]/g, '"')
    .replace(/[^\w"()-]/g, '');
}

/**
 * Searches the text layer of a rendered PDF page and highlights the exact quote.
 */
export function highlightQuoteInTextLayer(
  pageContainer: HTMLElement,
  target: HighlightTarget,
  currentPage: number
): HighlightResult {
  if (!pageContainer || !target.quote || !target.quote.trim()) {
    return { found: false, highlightedCount: 0, isPartial: false, isCrossPage: false };
  }

  // 1. Locate the textLayer element inside page container
  const textLayer =
    (pageContainer.querySelector('.react-pdf__Page__textContent') as HTMLElement) ||
    (pageContainer.querySelector('.textLayer') as HTMLElement) ||
    pageContainer;

  // Clear any existing highlights first
  clearExistingHighlights(textLayer);

  // 2. Collect all text spans in DOM order
  const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];
  if (spans.length === 0) {
    return { found: false, highlightedCount: 0, isPartial: false, isCrossPage: false };
  }

  // -------------------------------------------------------------------------
  // STRATEGY A: Direct Word-Sequence Span Matcher (immune to offset drift)
  // -------------------------------------------------------------------------
  const quoteWords = target.quote
    .trim()
    .split(/\s+/)
    .map(cleanWord)
    .filter((w) => w.length > 0);

  if (quoteWords.length > 0) {
    // Map words across spans
    const allWords: Array<{ word: string; sIdx: number; wordIdxInSpan: number }> = [];

    for (let sIdx = 0; sIdx < spans.length; sIdx++) {
      const raw = spans[sIdx].textContent || '';
      const words = raw
        .split(/\s+/)
        .map(cleanWord)
        .filter((w) => w.length > 0);

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        allWords.push({ word: words[wIdx], sIdx, wordIdxInSpan: wIdx });
      }
    }

    if (allWords.length >= Math.min(quoteWords.length, 3)) {
      let bestStartSpan = -1;
      let bestEndSpan = -1;
      let bestScore = 0;

      const maxStart = allWords.length - Math.min(quoteWords.length, 3);
      for (let i = 0; i <= maxStart; i++) {
        let matches = 0;
        const compareLen = Math.min(quoteWords.length, allWords.length - i);
        for (let j = 0; j < compareLen; j++) {
          const docW = allWords[i + j].word;
          const qW = quoteWords[j];
          if (docW === qW || (qW.length >= 4 && (docW.includes(qW) || qW.includes(docW)))) {
            matches++;
          }
        }

        const matchRatio = matches / (quoteWords.length || 1);
        if (matchRatio > bestScore && matches >= Math.min(quoteWords.length, 3)) {
          bestScore = matchRatio;
          bestStartSpan = allWords[i].sIdx;
          bestEndSpan = allWords[Math.min(i + quoteWords.length - 1, allWords.length - 1)].sIdx;
        }
      }

      if (bestScore >= 0.5 && bestStartSpan !== -1 && bestEndSpan !== -1) {
        let firstMark: HTMLElement | undefined;
        let highlightedCount = 0;

        for (let sIdx = bestStartSpan; sIdx <= bestEndSpan; sIdx++) {
          const span = spans[sIdx];
          if (!span) continue;

          const spanText = span.textContent || '';
          if (!spanText.trim()) continue;

          const mark = document.createElement('mark');
          mark.className = 'contract-citation-highlight';
          mark.textContent = spanText;

          span.textContent = '';
          span.appendChild(mark);

          if (!firstMark) {
            firstMark = mark;
          }
          highlightedCount++;
        }

        if (firstMark) {
          setTimeout(() => {
            firstMark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 120);
        }

        return {
          found: true,
          highlightedCount,
          isPartial: bestScore < 0.95,
          isCrossPage: false,
          firstMarkElement: firstMark,
        };
      }
    }
  }

  // -------------------------------------------------------------------------
  // STRATEGY B: Fallback Character Mapping for cross-page or partial prefixes
  // -------------------------------------------------------------------------
  let pageText = '';
  interface CharMap {
    spanIndex: number;
    charIndexInSpan: number;
  }
  const charToSpan: CharMap[] = [];

  for (let sIdx = 0; sIdx < spans.length; sIdx++) {
    const spanText = spans[sIdx].textContent || '';
    for (let cIdx = 0; cIdx < spanText.length; cIdx++) {
      charToSpan.push({ spanIndex: sIdx, charIndexInSpan: cIdx });
      pageText += spanText[cIdx];
    }
    charToSpan.push({ spanIndex: sIdx, charIndexInSpan: spanText.length });
    pageText += ' ';
  }

  const { normalized: normPageText, indexMap: pageIndexMap } = normalizeWithMap(pageText);
  const targetQuoteClean = target.quote.trim();
  const { normalized: normQuote } = normalizeWithMap(targetQuoteClean);

  if (!normQuote || normQuote.length < 3) {
    return { found: false, highlightedCount: 0, isPartial: false, isCrossPage: false };
  }

  const matchIndices: number[] = [];
  let searchPos = 0;
  const lowerPage = normPageText.toLowerCase();
  const lowerQuote = normQuote.toLowerCase();

  while (true) {
    const idx = lowerPage.indexOf(lowerQuote, searchPos);
    if (idx === -1) break;
    matchIndices.push(idx);
    searchPos = idx + lowerQuote.length;
  }

  let chosenMatchIdx = -1;
  let isPartial = false;
  let isCrossPage = false;
  let matchLength = lowerQuote.length;

  if (matchIndices.length > 0) {
    chosenMatchIdx = target.occurrenceIndex !== undefined && target.occurrenceIndex < matchIndices.length
      ? matchIndices[target.occurrenceIndex]
      : matchIndices[0];
  } else {
    if (target.pageEnd && target.pageEnd > currentPage) {
      isCrossPage = true;
      for (let len = lowerQuote.length - 1; len >= 20; len -= 5) {
        const prefix = lowerQuote.slice(0, len);
        const pIdx = lowerPage.lastIndexOf(prefix);
        if (pIdx !== -1) {
          chosenMatchIdx = pIdx;
          matchLength = len;
          isPartial = true;
          break;
        }
      }
    } else if (target.pageStart && target.pageStart < currentPage) {
      isCrossPage = true;
      for (let start = 10; start <= lowerQuote.length - 20; start += 5) {
        const suffix = lowerQuote.slice(start);
        const sIdx = lowerPage.indexOf(suffix);
        if (sIdx !== -1) {
          chosenMatchIdx = sIdx;
          matchLength = suffix.length;
          isPartial = true;
          break;
        }
      }
    }
  }

  if (chosenMatchIdx === -1) {
    return { found: false, highlightedCount: 0, isPartial: false, isCrossPage };
  }

  const rawStartChar = pageIndexMap[chosenMatchIdx];
  const rawEndNormIdx = chosenMatchIdx + matchLength - 1;
  const rawEndChar =
    pageIndexMap[rawEndNormIdx] !== undefined
      ? pageIndexMap[rawEndNormIdx] + 1
      : rawStartChar + matchLength;

  if (rawStartChar === undefined || rawStartChar >= charToSpan.length) {
    return { found: false, highlightedCount: 0, isPartial, isCrossPage };
  }

  const startLoc = charToSpan[rawStartChar];
  const endLoc = charToSpan[Math.min(rawEndChar - 1, charToSpan.length - 1)];

  if (!startLoc || !endLoc) {
    return { found: false, highlightedCount: 0, isPartial, isCrossPage };
  }

  const startSpanIdx = startLoc.spanIndex;
  const endSpanIdx = endLoc.spanIndex;

  let firstMark: HTMLElement | undefined;
  let highlightedCount = 0;

  for (let sIdx = startSpanIdx; sIdx <= endSpanIdx; sIdx++) {
    const span = spans[sIdx];
    if (!span) continue;

    const spanText = span.textContent || '';
    const spanCharStart = sIdx === startSpanIdx ? startLoc.charIndexInSpan : 0;
    const spanCharEnd = sIdx === endSpanIdx ? endLoc.charIndexInSpan + 1 : spanText.length;

    const before = spanText.slice(0, spanCharStart);
    const highlighted = spanText.slice(spanCharStart, spanCharEnd);
    const after = spanText.slice(spanCharEnd);

    if (!highlighted) continue;

    const mark = document.createElement('mark');
    mark.className = 'contract-citation-highlight';
    mark.textContent = highlighted;

    span.textContent = '';
    if (before) span.appendChild(document.createTextNode(before));
    span.appendChild(mark);
    if (after) span.appendChild(document.createTextNode(after));

    if (!firstMark) {
      firstMark = mark;
    }
    highlightedCount++;
  }

  if (firstMark) {
    setTimeout(() => {
      firstMark?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }

  return {
    found: true,
    highlightedCount,
    isPartial,
    isCrossPage,
    firstMarkElement: firstMark,
  };
}
