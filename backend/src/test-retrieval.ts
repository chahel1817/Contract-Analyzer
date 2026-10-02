import { prisma } from './utils/prisma';
import { documentService } from './services/document.service';
import { chunkingService } from './services/chunking.service';
import { retrievalService } from './services/retrieval.service';

async function runRetrievalTests() {
  console.log('====================================================');
  console.log('🧪 TESTING RETRIEVAL SERVICE (WITHOUT AI)');
  console.log('====================================================\n');

  let testDocId = '';

  try {
    // 1. Create a sample contract with distinct clauses across 2 simulated pages
    console.log('1. Setting up test contract with distinct clauses...');
    const contractText = `
[[PAGE_1]]
MASTER SERVICES AGREEMENT

Clause 1. Definitions and Confidentiality
The Receiving Party agrees to protect and maintain all Confidential Information in strict confidence for a period of five (5) years following initial disclosure, preventing unauthorized reproduction or access.

Clause 2. Limitation of Liability and Liability Cap
Except for gross negligence or willful misconduct, in no event shall either party's aggregate liability arising out of or related to this Agreement exceed $1,000,000 USD or the total service fees paid in the prior twelve (12) months. Neither party shall be liable for indirect, punitive, or consequential damages.

[[PAGE_2]]
Clause 3. Term and Termination for Cause
Either party may terminate this Agreement immediately upon thirty (30) days written notice if the other party breaches any material provision and fails to cure such breach within the cure window.

Clause 4. Governing Law, Jurisdiction, and Arbitration
This Agreement and any dispute arising hereunder shall be exclusively governed by and construed in accordance with the substantive laws of the State of Delaware, without regard to conflict of laws principles.
`;

    const doc = await documentService.createDocument({
      title: 'Retrieval Evaluation Agreement',
      fileName: 'retrieval_test.pdf',
      fileType: 'application/pdf',
      fileSize: contractText.length,
      filePath: 'uploads/retrieval_test.pdf',
      extractedText: contractText,
      pageCount: 2,
      status: 'READY',
    });
    testDocId = doc.id;
    console.log(`✓ Document created (ID: ${testDocId})`);

    // 2. Index chunks
    const chunkCount = await chunkingService.processAndStoreChunks(testDocId, contractText);
    console.log(`✓ Chunks indexed: ${chunkCount} chunks stored in DocumentChunk table\n`);

    // 3. Test Query 1: Liability
    const query1 = 'What is the limitation of liability cap?';
    console.log(`🔍 Test Query 1: "${query1}"`);
    const results1 = await retrievalService.searchDocument(query1, testDocId, 3);
    console.log(`   Found ${results1.length} relevant chunk(s):`);
    results1.forEach((r, idx) => {
      console.log(`   [Rank ${idx + 1}] Score: ${r.score} | Page: ${r.pageStart} | Matched: [${r.matchedKeywords.join(', ')}]`);
      console.log(`          Excerpt: "${r.text.slice(0, 100).replace(/\n/g, ' ')}..."`);
    });

    if (results1[0] && results1[0].text.includes('Limitation of Liability')) {
      console.log('   ✅ PASS: Clause 2 (Limitation of Liability) ranked #1!\n');
    } else {
      console.log('   ❌ FAIL: Clause 2 was not ranked #1\n');
    }

    // 4. Test Query 2: Termination
    const query2 = 'How can a party terminate for breach or cause?';
    console.log(`🔍 Test Query 2: "${query2}"`);
    const results2 = await retrievalService.searchDocument(query2, testDocId, 3);
    console.log(`   Found ${results2.length} relevant chunk(s):`);
    results2.forEach((r, idx) => {
      console.log(`   [Rank ${idx + 1}] Score: ${r.score} | Page: ${r.pageStart} | Matched: [${r.matchedKeywords.join(', ')}]`);
      console.log(`          Excerpt: "${r.text.slice(0, 100).replace(/\n/g, ' ')}..."`);
    });

    if (results2[0] && results2[0].text.includes('Termination for Cause')) {
      console.log('   ✅ PASS: Clause 3 (Termination) ranked #1!\n');
    } else {
      console.log('   ❌ FAIL: Clause 3 was not ranked #1\n');
    }

    // 5. Test Query 3: Governing Law
    const query3 = 'Which state laws govern this contract?';
    console.log(`🔍 Test Query 3: "${query3}"`);
    const results3 = await retrievalService.searchDocument(query3, testDocId, 3);
    console.log(`   Found ${results3.length} relevant chunk(s):`);
    results3.forEach((r, idx) => {
      console.log(`   [Rank ${idx + 1}] Score: ${r.score} | Page: ${r.pageStart} | Matched: [${r.matchedKeywords.join(', ')}]`);
      console.log(`          Excerpt: "${r.text.slice(0, 100).replace(/\n/g, ' ')}..."`);
    });

    if (results3[0] && results3[0].text.includes('Governing Law')) {
      console.log('   ✅ PASS: Clause 4 (Governing Law) ranked #1!\n');
    } else {
      console.log('   ❌ FAIL: Clause 4 was not ranked #1\n');
    }

  } catch (error) {
    console.error('Retrieval test failed with error:', error);
  } finally {
    if (testDocId) {
      console.log('Cleaning up test document...');
      await documentService.deleteDocument(testDocId);
      console.log('✓ Test document and chunks cleaned up.');
    }
    await prisma.$disconnect();
    console.log('\n✨ Retrieval service evaluation complete.');
  }
}

runRetrievalTests();
