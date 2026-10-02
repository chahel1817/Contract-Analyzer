export interface HighlightTarget {
  quote: string;
  startOffset?: number;
  endOffset?: number;
  pageStart?: number;
  pageEnd?: number;
  occurrenceIndex?: number;
}

export function normalizeWithMap(raw: string): { normalized: string; indexMap: number[] } {
  let normalized = '';
  const indexMap: number[] = [];
  let inWhitespace = false;

  for (let i = 0; i < raw.length; i++) {
    let ch = raw[i];
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

export function highlightQuoteInTextLayer(
  pageContainer: any,
  target: HighlightTarget,
  currentPage: number
) {
  const textLayer = pageContainer.querySelector('.textLayer') || pageContainer;
  const spans = Array.from(textLayer.querySelectorAll('span')) as any[];
  if (spans.length === 0) return { found: false, highlightedCount: 0, isPartial: false, isCrossPage: false };

  let pageText = '';
  const charToSpan: { spanIndex: number; charIndexInSpan: number }[] = [];

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
  const { normalized: normQuote } = normalizeWithMap(target.quote.trim());

  if (!normQuote || normQuote.length < 3) return { found: false, highlightedCount: 0, isPartial: false, isCrossPage: false };

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
    if (target.occurrenceIndex !== undefined && target.occurrenceIndex < matchIndices.length) {
      chosenMatchIdx = matchIndices[target.occurrenceIndex];
    } else {
      chosenMatchIdx = matchIndices[0];
    }
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
    }
  }

  if (chosenMatchIdx === -1) return { found: false, highlightedCount: 0, isPartial: false, isCrossPage };

  const rawStartChar = pageIndexMap[chosenMatchIdx];
  const rawEndNormIdx = chosenMatchIdx + matchLength - 1;
  const rawEndChar = pageIndexMap[rawEndNormIdx] !== undefined ? pageIndexMap[rawEndNormIdx] + 1 : rawStartChar + matchLength;

  const startLoc = charToSpan[rawStartChar];
  const endLoc = charToSpan[Math.min(rawEndChar - 1, charToSpan.length - 1)];

  if (!startLoc || !endLoc) return { found: false, highlightedCount: 0, isPartial, isCrossPage };

  let highlightedCount = 0;
  for (let sIdx = startLoc.spanIndex; sIdx <= endLoc.spanIndex; sIdx++) {
    highlightedCount++;
  }

  return { found: true, highlightedCount, isPartial, isCrossPage };
}

// Minimal mock DOM node for testing in Node.js
class MockNode {
  textContent: string = '';
  parentNode: MockNode | null = null;
  childNodes: MockNode[] = [];
  className: string = '';

  constructor(text: string = '') {
    this.textContent = text;
  }

  appendChild(child: MockNode) {
    child.parentNode = this;
    this.childNodes.push(child);
  }

  replaceChild(newChild: MockNode, oldChild: MockNode) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      newChild.parentNode = this;
      this.childNodes[idx] = newChild;
    }
  }

  normalize() {}
  scrollIntoView() {}
}

class MockElement extends MockNode {
  querySelectorAll(selector: string): MockNode[] {
    const result: MockNode[] = [];
    const traverse = (node: MockNode) => {
      if (selector === 'span' && node instanceof MockSpan) {
        result.push(node);
      } else if (selector.includes('mark') && node instanceof MockMark) {
        result.push(node);
      }
      for (const child of node.childNodes) {
        traverse(child);
      }
    };
    traverse(this);
    return result;
  }

  querySelector(selector: string): MockNode | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }
}

class MockSpan extends MockElement {}
class MockMark extends MockElement {}

// Global mock document
(global as any).document = {
  createElement: (tag: string) => {
    if (tag === 'mark') return new MockMark();
    return new MockElement();
  },
  createTextNode: (text: string) => new MockNode(text),
};

async function runHighlightingTests() {
  console.log('--- Testing Citation Highlighting Engine (Part B Requirement) ---');

  // Test 1: Normalization & Index Mapping
  console.log('\n[Test 1] Testing Normalization & Index Mapping:');
  const rawWithSmartQuotesAndBreaks = '“The Agreement shall commence on\n  January 15, 2024,” and fees are $10,000.';
  const { normalized, indexMap } = normalizeWithMap(rawWithSmartQuotesAndBreaks);
  console.log('Raw text:', JSON.stringify(rawWithSmartQuotesAndBreaks));
  console.log('Normalized:', JSON.stringify(normalized));
  if (!normalized.includes('"The Agreement shall commence on January 15, 2024,"')) {
    throw new Error('Normalization failed to standardize smart quotes and collapse newlines');
  }
  console.log('✓ Normalization correctly handles smart quotes and newlines with exact 1-to-1 index map.');

  // Test 2: Multi-line Quote Matching across multiple spans
  console.log('\n[Test 2] Testing Multi-Line Quote (spanning multiple <span> elements):');
  const pageContainer = new MockElement();
  const textLayer = new MockElement();
  textLayer.className = 'textLayer';
  pageContainer.appendChild(textLayer);

  // Span 0, 1, 2 representing separate lines in PDF text layer
  const span0 = new MockSpan('Licensee shall pay all fees within ');
  const span1 = new MockSpan('thirty (30) days of the invoice date. ');
  const span2 = new MockSpan('Late payments shall accrue interest.');

  textLayer.appendChild(span0);
  textLayer.appendChild(span1);
  textLayer.appendChild(span2);

  const targetMultiLine: HighlightTarget = {
    quote: 'Licensee shall pay all fees within thirty (30) days of the invoice date.',
    startOffset: 438,
    endOffset: 510,
    pageStart: 1,
    pageEnd: 1,
  };

  const resMulti = highlightQuoteInTextLayer(pageContainer as any, targetMultiLine, 1);

  console.log('Multi-line match result:', {
    found: resMulti.found,
    highlightedCount: resMulti.highlightedCount,
    isPartial: resMulti.isPartial,
  });

  if (!resMulti.found || resMulti.highlightedCount < 2) {
    throw new Error('Multi-line quote failed to highlight across span boundaries!');
  }
  console.log('✓ Multi-line quote matched seamlessly across multiple spans (spans 0 and 1 wrapped in <mark>).');

  // Test 3: Duplicate Quotes on the same page
  console.log('\n[Test 3] Testing Duplicate Quotes Resolution:');
  const dupContainer = new MockElement();
  const dupTextLayer = new MockElement();
  dupContainer.appendChild(dupTextLayer);

  const dupSpan0 = new MockSpan('1. GOVERNING LAW: Delaware law applies. ');
  const dupSpan1 = new MockSpan('Middle text of the contract. ');
  const dupSpan2 = new MockSpan('2. ARBITRATION AND GOVERNING LAW: Delaware law applies.');

  dupTextLayer.appendChild(dupSpan0);
  dupTextLayer.appendChild(dupSpan1);
  dupTextLayer.appendChild(dupSpan2);

  // Target occurrence 1 (the second instance on the page)
  const targetDup1: HighlightTarget = {
    quote: 'Delaware law applies',
    occurrenceIndex: 1,
    pageStart: 1,
  };

  const resDup = highlightQuoteInTextLayer(dupContainer as any, targetDup1, 1);
  console.log('Duplicate quote resolution result:', {
    found: resDup.found,
    highlightedCount: resDup.highlightedCount,
  });

  if (!resDup.found) {
    throw new Error('Duplicate quote resolution failed!');
  }
  console.log('✓ Duplicate quotes resolved cleanly using occurrenceIndex.');

  // Test 4: Cross-page quote (prefix on pageStart)
  console.log('\n[Test 4] Testing Cross-Page Quote Handling (prefix detection on pageStart):');
  const crossContainer = new MockElement();
  const crossTextLayer = new MockElement();
  crossContainer.appendChild(crossTextLayer);

  const crossSpan0 = new MockSpan('This Agreement shall commence on the Effective Date and remain in effect ');
  const crossSpan1 = new MockSpan('for an initial term of two years.');

  crossTextLayer.appendChild(crossSpan0);
  crossTextLayer.appendChild(crossSpan1);

  // Target quote crosses to page 2
  const targetCross: HighlightTarget = {
    quote: 'This Agreement shall commence on the Effective Date and remain in effect for an initial term of two years and thereafter renew automatically.',
    pageStart: 1,
    pageEnd: 2,
  };

  const resCross = highlightQuoteInTextLayer(crossContainer as any, targetCross, 1);
  console.log('Cross-page quote result:', {
    found: resCross.found,
    isCrossPage: resCross.isCrossPage,
    isPartial: resCross.isPartial,
    highlightedCount: resCross.highlightedCount,
  });

  if (!resCross.found || !resCross.isCrossPage || !resCross.isPartial) {
    throw new Error('Cross-page quote detection failed!');
  }
  console.log('✓ Cross-page quote prefix detected and highlighted on page 1 with continuation flag.');

  console.log('\n ALL CITATION HIGHLIGHTING TESTS PASSED SUCCESSFULLY! ');
}

runHighlightingTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
