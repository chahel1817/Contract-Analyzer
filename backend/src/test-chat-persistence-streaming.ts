import { prisma } from './utils/prisma';

async function testStreamingAndPersistence() {
  console.log('--- Testing Chat Streaming, Verification, and Persistence ---');

  // 1. Create a test document
  const rawContract = `[[PAGE_1]]
COMMERCIAL LEASE AGREEMENT
Landlord: Metro Commercial Properties LLC
Tenant: Zenith Tech Labs Inc.
Premises: Suite 400, 100 Innovation Way, Austin, Texas.

1. LEASE TERM
The term of this Lease shall be thirty-six (36) months, commencing on March 1, 2024.

2. BASE RENT AND SECURITY DEPOSIT
Tenant shall pay monthly base rent of $12,500 due on the first day of each calendar month. Tenant shall deposit a security deposit of $25,000 upon execution.

[[PAGE_2]]
3. USE OF PREMISES AND ALTERATIONS
The Premises shall be used solely for general office and software engineering activities. Tenant shall not make any structural alterations without Landlord's prior written consent.

4. DEFAULT AND REMEDIES
If Tenant fails to pay rent within ten (10) days of notice, Landlord may terminate this Lease and re-enter the Premises. Tenant shall remain liable for all unpaid rent and consequential damages.`;

  const doc = await prisma.document.create({
    data: {
      title: 'Commercial Lease Agreement - Zenith Tech',
      fileName: 'commercial_lease_zenith.pdf',
      fileType: 'application/pdf',
      fileSize: rawContract.length,
      filePath: 'uploads/commercial_lease_zenith.pdf',
      extractedText: rawContract,
      pageCount: 2,
      status: 'READY',
    },
  });
  console.log(`✓ Created test document: ${doc.id}`);

  // Chunks
  await prisma.documentChunk.createMany({
    data: [
      {
        documentId: doc.id,
        chunkIndex: 0,
        text: 'COMMERCIAL LEASE AGREEMENT. Landlord: Metro Commercial Properties LLC. Tenant: Zenith Tech Labs Inc. 1. LEASE TERM: thirty-six (36) months, commencing on March 1, 2024.',
        pageStart: 1,
        pageEnd: 1,
        charStart: 0,
        charEnd: 250,
      },
      {
        documentId: doc.id,
        chunkIndex: 1,
        text: '2. BASE RENT AND SECURITY DEPOSIT: Tenant shall pay monthly base rent of $12,500 due on the first day of each calendar month. Tenant shall deposit a security deposit of $25,000 upon execution.',
        pageStart: 1,
        pageEnd: 1,
        charStart: 251,
        charEnd: 500,
      },
      {
        documentId: doc.id,
        chunkIndex: 2,
        text: '3. USE OF PREMISES: general office and software engineering activities. Tenant shall not make any structural alterations without prior written consent. 4. DEFAULT: fail to pay within ten (10) days, Landlord may terminate.',
        pageStart: 2,
        pageEnd: 2,
        charStart: 501,
        charEnd: 850,
      },
    ],
  });
  console.log('✓ Created chunks for retrieval');

  // 2. Test POST /api/chat with streaming (SSE)
  console.log('\n--- Step 15: Testing Streaming SSE on POST /api/chat ---');
  const response = await fetch('http://localhost:5000/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      documentId: doc.id,
      question: 'What is the monthly base rent and security deposit required?',
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to initiate stream: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let receivedDeltas = '';
  let doneData: any = null;
  let receivedStatuses: string[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkStr = decoder.decode(value);
    const lines = chunkStr.split('\n');

    let currentEvent = 'message';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        try {
          const parsed = JSON.parse(raw);
          if (currentEvent === 'delta') {
            receivedDeltas += parsed.text || '';
            process.stdout.write(parsed.text || '');
          } else if (currentEvent === 'status') {
            receivedStatuses.push(parsed.message);
          } else if (currentEvent === 'done') {
            doneData = parsed;
          }
        } catch {}
      }
    }
  }

  console.log('\n\n✓ Streaming finished.');
  console.log('Statuses received:', receivedStatuses);
  console.log('Total tokens/text streamed length:', receivedDeltas.length);

  if (!doneData) {
    throw new Error('SSE did not receive "done" event');
  }

  console.log('Conversation ID from done event:', doneData.conversationId);
  console.log('Citations received:', doneData.citations?.length || 0);

  // 3. Test Step 16: Chat Persistence across reloads
  console.log('\n--- Step 16: Testing Chat Persistence (Simulating Page Refresh) ---');
  const convResponse = await fetch(`http://localhost:5000/api/conversations/${doc.id}`);
  const convResult = await convResponse.json();

  if (!convResult.success || !convResult.data || convResult.data.length === 0) {
    throw new Error('Persistence failed: No conversation found for document after refresh!');
  }

  const savedConv = convResult.data[0];
  console.log(`✓ Fetched persisted conversation: ${savedConv.id}`);
  console.log(`✓ Total persisted messages: ${savedConv.messages?.length}`);

  const userMsg = savedConv.messages?.find((m: any) => m.role === 'user');
  const assistantMsg = savedConv.messages?.find((m: any) => m.role === 'assistant');

  if (!userMsg || !assistantMsg) {
    throw new Error('Persistence failed: Messages not properly recorded');
  }

  console.log(`✓ User message persisted: "${userMsg.content}"`);
  console.log(`✓ Assistant message persisted (${assistantMsg.content.length} chars)`);
  console.log(`✓ Citations persisted: ${assistantMsg.citations?.length || 0}`);

  if (assistantMsg.citations && assistantMsg.citations.length > 0) {
    const cit = assistantMsg.citations[0];
    console.log('Verified Citation Details:', {
      quote: cit.quote,
      verified: cit.verified,
      startOffset: cit.startOffset,
      endOffset: cit.endOffset,
      pageStart: cit.pageStart,
    });
  }

  // Clean up
  await prisma.document.delete({ where: { id: doc.id } });
  console.log('\n✓ Cleaned up test document and cascaded records');
  console.log(' ALL STREAMING AND PERSISTENCE TESTS PASSED! ');
}

testStreamingAndPersistence()
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
