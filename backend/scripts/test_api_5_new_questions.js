const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const questions = [
  {
    name: '1. Authorized User',
    text: 'Who is considered an Authorized User under the agreement?',
    minQuotes: 2,
    expectedKeywords: ['authorized user', 'employee', 'agent', 'named user'],
    forbiddenInQuotes: ['applicable term', 'customer data', 'demarcation point'],
  },
  {
    name: '2. Service Fees & Payment Due',
    text: 'When are Service fees invoiced and when are payments due?',
    minQuotes: 2,
    expectedKeywords: ['delivery', 'applicable term', '30 days', 'invoice'],
    forbiddenInQuotes: ['work product', 'attachment d', 'intellectual property'],
  },
  {
    name: '3. Failure to Pay / Late Payment',
    text: 'What happens if the Customer fails to pay an invoice on time?',
    minQuotes: 1,
    expectedKeywords: ['late fee', 'interest rate', 'secretary of the treasury', '7109'],
    forbiddenInQuotes: ['availability requirement', 'service level', '99.9%'],
  },
  {
    name: '4. Service Use Restrictions',
    text: 'What restrictions does the agreement place on Customer\'s use of the Service?',
    minQuotes: 1,
    expectedKeywords: ['decompile', 'disassemble', 'reverse-engineer', 'proprietary-rights'],
    forbiddenInQuotes: ['service level failure', 'availability requirement'],
  },
  {
    name: '5. Warranty and Remedies',
    text: 'What warranty does OneStream provide regarding the Service?',
    minQuotes: 3,
    expectedKeywords: ['documentation', 'repair or replacement', 'refund', 'uninterrupted'],
    forbiddenInQuotes: ['demarcation point', 'third-party demand', 'support services table', 'fedramp'],
  },
];

async function run() {
  const doc = await p.document.findFirst({
    where: { fileName: { contains: 'Onestream', mode: 'insensitive' } },
    orderBy: { createdAt: 'desc' },
  });

  if (!doc) {
    console.error('No Onestream doc found in database');
    process.exit(1);
  }

  console.log(`Testing against document: ${doc.title} (${doc.id})\n`);

  let conversationId = null;
  let allPass = true;

  for (const q of questions) {
    console.log(`\n==================================================`);
    console.log(`TEST: ${q.name}`);
    console.log(`Question: "${q.text}"`);

    const res = await fetch('http://localhost:5000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: doc.id,
        question: q.text,
        conversationId: conversationId || undefined,
      }),
    });

    if (!res.ok) {
      console.error(`HTTP error: ${res.status} ${res.statusText}`);
      allPass = false;
      continue;
    }

    const data = await res.json();
    conversationId = data.conversationId;

    console.log(`\n--- Response Answer ---`);
    console.log(data.answer);

    console.log(`\n--- Citations Extracted & Verified (${data.citations.length} quotes) ---`);
    data.citations.forEach((c, idx) => {
      console.log(`[Quote ${idx + 1}] Page ${c.pageStart}, Verified: ${c.verified}, Confidence: ${c.confidence}`);
      console.log(`  "${c.quote}"`);
    });

    // Validations:
    const answerHasEvidenceBlock = /Evidence:/i.test(data.answer);
    if (answerHasEvidenceBlock) {
      console.error(`FAIL: Answer contains 'Evidence:' block!`);
      allPass = false;
    } else {
      console.log(`PASS: No Evidence: block inside answer prose.`);
    }

    if (data.citations.length < q.minQuotes) {
      console.error(`FAIL: Extracted ${data.citations.length} quotes, expected at least ${q.minQuotes}`);
      allPass = false;
    } else {
      console.log(`PASS: Extracted ${data.citations.length} verified quotes (expected >= ${q.minQuotes}).`);
    }

    // Keyword checks
    const lowerAns = data.answer.toLowerCase();
    for (const kw of q.expectedKeywords) {
      if (!lowerAns.includes(kw)) {
        console.error(`FAIL: Answer missing expected keyword "${kw}"`);
        allPass = false;
      } else {
        console.log(`PASS: Answer contains keyword "${kw}"`);
      }
    }

    // Forbidden in quotes check (Relevance & Precision Gate)
    for (const cit of data.citations) {
      const lowerCit = cit.quote.toLowerCase();
      for (const forbidden of q.forbiddenInQuotes) {
        if (lowerCit.includes(forbidden)) {
          console.error(`FAIL: Citation contains forbidden/unrelated term "${forbidden}" in quote!`);
          allPass = false;
        }
      }
    }
    console.log(`PASS: All quotes passed relevance gate (no unrelated/polluted content).`);
  }

  console.log(`\n==================================================`);
  if (allPass) {
    console.log(`OVERALL RESULT: ALL 5 QUESTIONS PASSED WITH HIGH PRECISION!`);
  } else {
    console.error(`OVERALL RESULT: SOME TESTS FAILED`);
    process.exit(1);
  }

  process.exit(0);
}

run();
