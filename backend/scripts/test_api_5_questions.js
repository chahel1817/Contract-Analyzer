const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const questions = [
  {
    name: '1. Applicable Term',
    text: 'What is the applicable term of the SaaS agreement?',
    minQuotes: 2,
    expectedKeywords: ['order schedule', 'commence'],
  },
  {
    name: '2. Liability + exceptions',
    text: "What is OneStream's aggregate liability cap, and what exceptions apply to that cap?",
    minQuotes: 3,
    expectedKeywords: ['12 months', 'gross negligence', 'consequential damages'],
  },
  {
    name: '3. Full Termination',
    text: 'Explain everything the agreement provides about termination, including what happens to Customer Data, prepaid fees, and which provisions survive termination.',
    minQuotes: 5,
    expectedKeywords: ['not an exclusive remedy', 'cease', '30th calendar day', 'refund', 'survive indefinitely'],
  },
  {
    name: '4. Availability + credits',
    text: "What are OneStream's service availability requirements and what service credits can the Customer receive if those requirements are not met?",
    minQuotes: 4,
    expectedKeywords: ['99.9%', '10%', '20%', 'sole'],
  },
  {
    name: '5. Customer Data + IP',
    text: 'What rights does the Customer have over its Customer Data, and who owns the intellectual property in the Service?',
    minQuotes: 3,
    expectedKeywords: ['onestream', 'customer data', 'access'],
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
    const answerHasInlineQuotes = /["“][^"”\r\n]{25,400}["”]/.test(data.answer);

    if (answerHasEvidenceBlock) {
      console.error(`FAIL: Answer contains 'Evidence:' block!`);
      allPass = false;
    } else {
      console.log(`PASS: No Evidence: block inside answer prose.`);
    }

    if (answerHasInlineQuotes) {
      console.warn(`WARNING: Answer contains long quoted string inside prose.`);
    } else {
      console.log(`PASS: Clean answer prose without embedded quote strings.`);
    }

    if (data.citations.length >= q.minQuotes) {
      console.log(`PASS: Extracted ${data.citations.length} verified quotes (expected >= ${q.minQuotes}).`);
    } else {
      console.error(`FAIL: Expected at least ${q.minQuotes} quotes, got ${data.citations.length}`);
      allPass = false;
    }

    for (const kw of q.expectedKeywords) {
      if (data.answer.toLowerCase().includes(kw.toLowerCase())) {
        console.log(`PASS: Answer contains keyword "${kw}"`);
      } else {
        console.error(`FAIL: Answer missing expected concept "${kw}"`);
        allPass = false;
      }
    }
  }

  console.log(`\n==================================================`);
  console.log(`OVERALL RESULT: ${allPass ? 'ALL 5 TESTS PASSED PERFECTLY!' : 'SOME TESTS FAILED'}`);
  process.exit(allPass ? 0 : 1);
}

run();
