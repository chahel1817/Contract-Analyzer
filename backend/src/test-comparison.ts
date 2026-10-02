import { comparisonService } from './services/comparison.service';
import { prisma } from './utils/prisma';

async function runComparisonTests() {
  console.log('🧪 Starting Phase 8: Contract Comparison Tests...\n');

  // Test 1: Clause Extraction
  console.log('1️⃣ Testing Clause Extraction:');
  const contractV1 = `
1. DEFINITIONS AND INTERPRETATION
In this Agreement, "Confidential Information" means all proprietary data and customer information disclosed by either party.

2. PAYMENT AND FEES
Customer shall pay Vendor the total fee of AED 100,000 within thirty (30) days of invoice receipt.

3. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and continue for one (1) year. Either party may terminate with 60 days written notice.

4. LIMITATION OF LIABILITY
Vendor's aggregate liability under this Agreement shall not exceed AED 100,000. Under no circumstances will Vendor be liable for indirect damages.

5. GOVERNING LAW
This Agreement shall be governed by the laws of England and Wales.
`.trim();

  const clausesV1 = comparisonService.extractClauses(contractV1);
  console.log(`  Extracted ${clausesV1.length} clauses from Version 1.`);
  for (const c of clausesV1) {
    console.log(`    - [${c.number || '#'}] ${c.title}`);
  }

  if (clausesV1.length < 4) {
    throw new Error(`Expected at least 4 clauses, got ${clausesV1.length}`);
  }
  console.log('  ✅ Clause extraction passed.\n');

  // Test 2: Substantive Differences Detection
  console.log('2️⃣ Testing Substantive Clause Comparison:');
  const contractV2 = `
1. DEFINITIONS AND INTERPRETATION
In this Agreement, "Confidential Information" means all proprietary data, trade secrets, and customer records disclosed by either party.

2. PAYMENT AND FEES
Customer shall pay Vendor the total fee of AED 250,000 within thirty (30) days of invoice receipt.

3. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and continue for one (1) year. Either party may terminate with 5 days written notice.

4. LIMITATION OF LIABILITY
Vendor's aggregate liability under this Agreement shall not exceed AED 1,000,000. Under no circumstances will Vendor be liable for indirect damages.

6. DATA PRIVACY AND SECURITY
Vendor agrees to implement robust ISO 27001 compliant technical measures to protect customer data.
`.trim();

  const comparison = await comparisonService.compare(
    {
      id: 'doc-v1',
      title: 'Master Services Agreement v1.0',
      fileName: 'msa_v1.pdf',
      text: contractV1,
    },
    {
      id: 'doc-v2',
      title: 'Master Services Agreement v2.0',
      fileName: 'msa_v2.pdf',
      text: contractV2,
    }
  );

  console.log(`  Total changes detected: ${comparison.totalChanges}`);
  console.log('  Change Counts:', comparison.counts);
  console.log('\n  Executive Summary:');
  console.log(`  "${comparison.executiveSummary}"\n`);

  console.log('  Detailed Clause Differences:');
  for (const c of comparison.comparisons) {
    console.log(`  --------------------------------------------------`);
    console.log(`  Clause:        ${c.clause}`);
    console.log(`  Change Type:   ${c.changeType}`);
    console.log(`  Significance:  ${c.significance}`);
    console.log(`  Summary:       ${c.summary}`);
    if (c.oldText) console.log(`  Old Text:      ${c.oldText.slice(0, 80).replace(/\n/g, ' ')}...`);
    if (c.newText) console.log(`  New Text:      ${c.newText.slice(0, 80).replace(/\n/g, ' ')}...`);
  }

  // Validations
  const liabilityChange = comparison.comparisons.find((c) =>
    c.clause.toLowerCase().includes('liability')
  );
  if (!liabilityChange) {
    throw new Error('Expected liability clause change to be detected!');
  }
  if (liabilityChange.significance !== 'High') {
    throw new Error(`Expected liability change significance to be High, got ${liabilityChange.significance}`);
  }
  console.log('\n  ✅ Liability cap shift (AED 100,000 -> AED 1,000,000) correctly flagged as HIGH significance.');

  const termChange = comparison.comparisons.find((c) =>
    c.clause.toLowerCase().includes('termination')
  );
  if (!termChange || termChange.significance !== 'High') {
    throw new Error(`Expected termination notice period change (60 days -> 5 days) to be High significance!`);
  }
  console.log('  ✅ Termination notice period shift (60 days -> 5 days) correctly flagged as HIGH significance.');

  const removedGoverningLaw = comparison.comparisons.find((c) =>
    c.clause.toLowerCase().includes('governing law')
  );
  if (!removedGoverningLaw || removedGoverningLaw.changeType !== 'removed') {
    throw new Error('Expected governing law clause removal to be detected!');
  }
  console.log('  ✅ Clause removal (Governing Law) correctly detected.');

  const addedDataPrivacy = comparison.comparisons.find((c) =>
    c.clause.toLowerCase().includes('data privacy')
  );
  if (!addedDataPrivacy || addedDataPrivacy.changeType !== 'added') {
    throw new Error('Expected data privacy clause addition to be detected!');
  }
  console.log('  ✅ Clause addition (Data Privacy) correctly detected.');

  // Test 3: End-to-End API Test using test documents in database
  console.log('\n3️⃣ Testing Comparison Database Integration / API payload:');
  const existingDocs = await prisma.document.findMany({
    where: { status: 'READY' },
    take: 2,
  });

  if (existingDocs.length >= 2) {
    const docA = existingDocs[0];
    const docB = existingDocs[1];
    console.log(`  Comparing DB documents: "${docA.title}" vs "${docB.title}"`);

    const result = await comparisonService.compare(
      {
        id: docA.id,
        title: docA.title,
        fileName: docA.fileName,
        text: docA.extractedText || '',
      },
      {
        id: docB.id,
        title: docB.title,
        fileName: docB.fileName,
        text: docB.extractedText || '',
      }
    );

    console.log(`  Comparison completed: ${result.totalChanges} changes identified.`);
    console.log(`  High: ${result.counts.high}, Medium: ${result.counts.medium}, Low: ${result.counts.low}`);
    console.log('  ✅ Database integration comparison succeeded.');
  } else {
    console.log('  ℹ️ Fewer than 2 ready documents in DB; skipping DB comparison query test.');
  }

  console.log('\n🎉 ALL PHASE 8 COMPARISON TESTS PASSED SUCCESSFULLY!\n');
}

runComparisonTests()
  .catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
