import fs from 'fs';
import path from 'path';
import { prisma } from './utils/prisma';
import { retrievalService } from './services/retrieval.service';
import { aiService } from './services/ai.service';
import { citationService } from './services/citation.service';

async function runE2ETest() {
  console.log('--- Starting Chat & Quote Verification E2E Test ---');

  // 1. Create a realistic multi-page test contract in DB
  const rawContractText = `[[PAGE_1]]
SOFTWARE LICENSE AND SERVICES AGREEMENT

This Agreement is entered into on January 15, 2024, by and between Apex Systems Inc. ("Licensor") and Global Logistics Corp. ("Licensee").

1. GRANT OF LICENSE
Licensor hereby grants to Licensee a non-exclusive, non-transferable, revocable license to access and use the Cloud Fleet Management Software solely for Licensee's internal business operations.

2. PAYMENT TERMS AND INVOICING
Licensee shall pay all fees within thirty (30) days of the invoice date. Late payments shall accrue interest at a rate of 1.5% per month or the maximum rate permitted by applicable law, whichever is less. All fees are non-refundable except as explicitly provided herein.

[[PAGE_2]]
3. CONFIDENTIALITY AND DATA PROTECTION
Each party agrees to preserve the confidentiality of all Proprietary Information disclosed by the other party. Neither party shall disclose Confidential Information to any third party without prior written consent, except to employees and contractors with a need to know.

4. INDEMNIFICATION AND LIABILITY
Licensor agrees to defend and indemnify Licensee against any third-party claim alleging that the Software infringes any valid United States patent or copyright. Licensor's maximum aggregate liability arising out of or related to this Agreement shall not exceed the total fees paid by Licensee in the twelve (12) months preceding the claim.

[[PAGE_3]]
5. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and remain in effect for an initial term of two (2) years. Either party may terminate this Agreement immediately upon written notice if the other party breaches any material term and fails to cure such breach within thirty (30) calendar days.

6. GOVERNING LAW AND ARBITRATION
This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to conflict of law principles. Any dispute arising out of this Agreement shall be resolved through binding arbitration administered by the American Arbitration Association in Wilmington, Delaware.`;

  // Create document in DB
  const doc = await prisma.document.create({
    data: {
      title: 'Apex Systems Master Services Agreement',
      fileName: 'apex_msa_test.pdf',
      fileType: 'application/pdf',
      fileSize: rawContractText.length,
      filePath: 'uploads/apex_msa_test.pdf',
      extractedText: rawContractText,
      pageCount: 3,
      status: 'READY',
    },
  });
  console.log(`✓ Document created: ID = ${doc.id}`);

  // Create Document chunks
  const chunksData = [
    {
      documentId: doc.id,
      chunkIndex: 0,
      text: 'SOFTWARE LICENSE AND SERVICES AGREEMENT. Apex Systems Inc. ("Licensor") and Global Logistics Corp. ("Licensee"). 1. GRANT OF LICENSE: non-exclusive, non-transferable, revocable license to access and use the Cloud Fleet Management Software.',
      pageStart: 1,
      pageEnd: 1,
      charStart: 0,
      charEnd: 350,
    },
    {
      documentId: doc.id,
      chunkIndex: 1,
      text: '2. PAYMENT TERMS AND INVOICING: Licensee shall pay all fees within thirty (30) days of the invoice date. Late payments shall accrue interest at a rate of 1.5% per month. All fees are non-refundable.',
      pageStart: 1,
      pageEnd: 1,
      charStart: 351,
      charEnd: 650,
    },
    {
      documentId: doc.id,
      chunkIndex: 2,
      text: '3. CONFIDENTIALITY AND DATA PROTECTION: Each party agrees to preserve the confidentiality of all Proprietary Information disclosed by the other party. Neither party shall disclose Confidential Information to any third party without prior written consent.',
      pageStart: 2,
      pageEnd: 2,
      charStart: 651,
      charEnd: 1050,
    },
    {
      documentId: doc.id,
      chunkIndex: 3,
      text: '4. INDEMNIFICATION AND LIABILITY: Licensor agrees to defend and indemnify Licensee against any third-party claim alleging that the Software infringes any valid United States patent or copyright. Licensor liability shall not exceed the total fees paid in the twelve (12) months.',
      pageStart: 2,
      pageEnd: 2,
      charStart: 1051,
      charEnd: 1450,
    },
    {
      documentId: doc.id,
      chunkIndex: 4,
      text: '5. TERM AND TERMINATION: initial term of two (2) years. Either party may terminate this Agreement immediately upon written notice if the other party breaches any material term and fails to cure such breach within thirty (30) calendar days.',
      pageStart: 3,
      pageEnd: 3,
      charStart: 1451,
      charEnd: 1850,
    },
    {
      documentId: doc.id,
      chunkIndex: 5,
      text: '6. GOVERNING LAW AND ARBITRATION: This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware. Any dispute shall be resolved through binding arbitration in Wilmington, Delaware.',
      pageStart: 3,
      pageEnd: 3,
      charStart: 1851,
      charEnd: 2250,
    },
  ];

  await prisma.documentChunk.createMany({ data: chunksData });
  console.log(`✓ Created ${chunksData.length} chunks`);

  // 2. Test Step 12: Quote verification service functions directly
  console.log('\n--- Step 12: Testing Quote Verification Unit Logic ---');
  const exactQuote = 'Licensee shall pay all fees within thirty (30) days of the invoice date.';
  const exactRes = citationService.verifyQuote(exactQuote, rawContractText);
  console.log('Verifying exact quote:', exactRes);
  if (!exactRes.verified || exactRes.pageStart !== 1) {
    throw new Error('Exact quote verification failed');
  }
  console.log('✓ Exact quote verified on page 1');

  const page3Quote = 'laws of the State of Delaware, without regard to conflict of law principles.';
  const page3Res = citationService.verifyQuote(page3Quote, rawContractText);
  console.log('Verifying page 3 quote:', page3Res);
  if (!page3Res.verified || page3Res.pageStart !== 3) {
    throw new Error('Page 3 quote verification failed');
  }
  console.log('✓ Page 3 quote verified with correct pageStart = 3');

  const fakeQuote = 'The licensee must pay a mandatory penalty of $50,000 upon early termination.';
  const fakeRes = citationService.verifyQuote(fakeQuote, rawContractText);
  console.log('Verifying hallucinated quote:', fakeRes);
  if (fakeRes.verified) {
    throw new Error('Hallucinated quote was falsely verified!');
  }
  console.log('✓ Hallucinated quote correctly rejected (verified = false)');

  // 3. Test HTTP POST /api/chat via fetch
  console.log('\n--- Step 11 & 13: Testing HTTP POST /api/chat & Citation Storage ---');
  const chatResponse = await fetch('http://localhost:5000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentId: doc.id,
      question: 'What are the payment terms and late payment interest rate under this agreement?',
    }),
  });

  const chatJson = await chatResponse.json();
  console.log('HTTP POST /api/chat Status:', chatResponse.status);
  console.log('HTTP Response JSON:', JSON.stringify(chatJson, null, 2));

  if (!chatJson.success) {
    throw new Error(`Chat API failed: ${chatJson.error}`);
  }

  console.log('\n--- Verifying Chat Output ---');
  console.log('Answer:', chatJson.answer);
  console.log('Citations Count:', chatJson.citations?.length || 0);

  // 4. Test Step 11: GET /api/conversations/:documentId
  console.log('\n--- Testing GET /api/conversations/:documentId ---');
  const convResponse = await fetch(`http://localhost:5000/api/conversations/${doc.id}`);
  const convJson = await convResponse.json();
  console.log('HTTP GET /api/conversations/:documentId Status:', convResponse.status);
  console.log('Conversations Count:', convJson.data?.length);
  console.log('First Conversation Messages:', convJson.data?.[0]?.messages?.length);

  const storedCitations = convJson.data?.[0]?.messages?.flatMap((m: any) => m.citations || []) || [];
  console.log('Stored Citations Count:', storedCitations.length);
  if (storedCitations.length > 0) {
    console.log('Sample stored citation:', {
      quote: storedCitations[0].quote,
      verified: storedCitations[0].verified,
      startOffset: storedCitations[0].startOffset,
      endOffset: storedCitations[0].endOffset,
      pageStart: storedCitations[0].pageStart,
      pageEnd: storedCitations[0].pageEnd,
    });
  }

  // 5. Clean up test document
  await prisma.document.delete({ where: { id: doc.id } });
  console.log('\n✓ Cleaned up test document and cascaded records');
  console.log('\n ALL TESTS PASSED SUCCESSFULLY! ');
}

runE2ETest()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
