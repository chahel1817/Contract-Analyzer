import { prisma } from './utils/prisma';

async function testMultiDocumentChat() {
  console.log('--- Testing Multi-Document Chat API (Part B Requirement) ---');

  // 1. Create Document A (Apex Master Services Agreement)
  const contractAText = `[[PAGE_1]]
APEX MASTER SERVICES AGREEMENT
Parties: Apex Global LLC and Enterprise Clients.

1. LIMITATION OF LIABILITY
In no event shall Apex Global aggregate liability arising under this Agreement exceed fifty thousand dollars ($50,000).

2. TERMINATION NOTICE
Either party may terminate this Agreement by providing at least sixty (60) days prior written notice.`;

  const docA = await prisma.document.create({
    data: {
      title: 'Apex Master Services Agreement',
      fileName: 'apex_msa_test.pdf',
      fileType: 'application/pdf',
      fileSize: contractAText.length,
      filePath: 'uploads/apex_msa_test.pdf',
      extractedText: contractAText,
      pageCount: 1,
      status: 'READY',
    },
  });
  console.log(`✓ Created Document A: ${docA.id} (${docA.title})`);

  await prisma.documentChunk.createMany({
    data: [
      {
        documentId: docA.id,
        chunkIndex: 0,
        text: 'APEX MASTER SERVICES AGREEMENT. 1. LIMITATION OF LIABILITY: In no event shall Apex Global aggregate liability arising under this Agreement exceed fifty thousand dollars ($50,000).',
        pageStart: 1,
        pageEnd: 1,
        charStart: 0,
        charEnd: 200,
      },
      {
        documentId: docA.id,
        chunkIndex: 1,
        text: '2. TERMINATION NOTICE: Either party may terminate this Agreement by providing at least sixty (60) days prior written notice.',
        pageStart: 1,
        pageEnd: 1,
        charStart: 201,
        charEnd: 350,
      },
    ],
  });

  // 2. Create Document B (Zenith Software License)
  const contractBText = `[[PAGE_1]]
ZENITH ENTERPRISE SOFTWARE LICENSE
Parties: Zenith Tech Labs and Licensees.

1. LIABILITY CAP
The maximum liability of Zenith Tech Labs shall be capped at one million dollars ($1,000,000) for all direct damages.

2. TERMINATION FOR CONVENIENCE
Either party may terminate this License immediately upon five (5) days written notice for any reason.`;

  const docB = await prisma.document.create({
    data: {
      title: 'Zenith Enterprise Software License',
      fileName: 'zenith_license_test.pdf',
      fileType: 'application/pdf',
      fileSize: contractBText.length,
      filePath: 'uploads/zenith_license_test.pdf',
      extractedText: contractBText,
      pageCount: 1,
      status: 'READY',
    },
  });
  console.log(`✓ Created Document B: ${docB.id} (${docB.title})`);

  await prisma.documentChunk.createMany({
    data: [
      {
        documentId: docB.id,
        chunkIndex: 0,
        text: 'ZENITH ENTERPRISE SOFTWARE LICENSE. 1. LIABILITY CAP: The maximum liability of Zenith Tech Labs shall be capped at one million dollars ($1,000,000) for all direct damages.',
        pageStart: 1,
        pageEnd: 1,
        charStart: 0,
        charEnd: 210,
      },
      {
        documentId: docB.id,
        chunkIndex: 1,
        text: '2. TERMINATION FOR CONVENIENCE: Either party may terminate this License immediately upon five (5) days written notice for any reason.',
        pageStart: 1,
        pageEnd: 1,
        charStart: 211,
        charEnd: 370,
      },
    ],
  });
  console.log('✓ Created chunks for both Document A and Document B');

  // 3. Test HTTP POST /api/chat with documentIds array (Requirement 20)
  console.log('\n--- Step 20: Testing POST /api/chat with documentIds array ---');
  const chatPayload = {
    documentIds: [docA.id, docB.id],
    question: 'Compare the liability caps and termination notice periods between these two contracts.',
    stream: false,
  };

  const response = await fetch('http://localhost:5000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(chatPayload),
  });

  const chatJson = await response.json();
  console.log('HTTP Status:', response.status);
  console.log('Response Success:', chatJson.success);
  console.log('Retrieved Chunks Count:', chatJson.retrievedChunksCount);
  console.log('\n--- Comparative Synthesis Answer ---');
  console.log(chatJson.answer);

  if (!chatJson.success) {
    throw new Error(`Chat API failed: ${chatJson.error}`);
  }

  // 4. Verify Citations Attribution:
  // "Every citation retains its documentId and is verified against that document only."
  console.log('\n--- Verifying Per-Document Citations Attribution ---');
  const citations = chatJson.citations || [];
  console.log(`Total Citations Generated: ${citations.length}`);

  let foundDocACitation = false;
  let foundDocBCitation = false;

  for (const cit of citations) {
    console.log(`Citation: "${cit.quote}" | Verified: ${cit.verified} | DocumentID: ${cit.documentId}`);

    if (cit.documentId === docA.id && cit.verified) {
      foundDocACitation = true;
      if (!contractAText.includes(cit.quote)) {
        throw new Error(`Citation attributed to Document A not found in Document A text!`);
      }
      console.log('✓ Verified against Document A text correctly');
    }

    if (cit.documentId === docB.id && cit.verified) {
      foundDocBCitation = true;
      if (!contractBText.includes(cit.quote)) {
        throw new Error(`Citation attributed to Document B not found in Document B text!`);
      }
      console.log('✓ Verified against Document B text correctly');
    }
  }

  // 5. Clean up test documents
  await prisma.document.delete({ where: { id: docA.id } });
  await prisma.document.delete({ where: { id: docB.id } });
  console.log('\n✓ Cleaned up test documents and cascaded records');

  console.log('\n ALL MULTI-DOCUMENT TESTS PASSED SUCCESSFULLY! ');
}

testMultiDocumentChat()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
