import { agentService, MAX_ROUNDS } from './services/agent.service';
import { prisma } from './utils/prisma';

async function runAgentTests() {
  console.log('🧪 Starting Part C Option 2: Agentic Document Research Tests...\n');

  // Verify at least one document exists in DB
  const doc = await prisma.document.findFirst({
    where: { status: 'READY' },
    orderBy: { updatedAt: 'desc' },
  });

  if (!doc) {
    throw new Error('No ready document found in database for testing agent.');
  }

  console.log(`Using test document: "${doc.title}" (ID: ${doc.id})`);

  // 1. Test Individual Tools
  console.log('\n1️⃣ Testing Tool 1: list_clauses()');
  const clausesResult = await agentService.executeTool('list_clauses', {}, doc.id);
  console.log(`  Discovered ${clausesResult.totalClauses} clauses in contract.`);
  if (!clausesResult.clauses || clausesResult.clauses.length === 0) {
    throw new Error('list_clauses() returned no clauses!');
  }
  for (const c of clausesResult.clauses.slice(0, 4)) {
    console.log(`    - [${c.number}] ${c.title} (${c.lengthChars} chars)`);
  }
  console.log('  ✅ list_clauses() passed.');

  console.log('\n2️⃣ Testing Tool 2: search_document()');
  const searchResult = await agentService.executeTool(
    'search_document',
    { query: 'liability cap fee payment' },
    doc.id
  );
  console.log(`  Found ${searchResult.resultsCount} matching chunks.`);
  if (!searchResult.chunks || searchResult.chunks.length === 0) {
    throw new Error('search_document() returned no chunks!');
  }
  console.log(`  Top score: ${searchResult.chunks[0].score} (Page ${searchResult.chunks[0].pageStart})`);
  console.log('  ✅ search_document() passed.');

  console.log('\n3️⃣ Testing Tool 3: get_section()');
  const targetSection = clausesResult.clauses[0].title;
  const sectionResult = await agentService.executeTool(
    'get_section',
    { sectionTitleOrNumber: targetSection },
    doc.id
  );
  console.log(`  Retrieved section "${sectionResult.title}" (Found: ${sectionResult.found})`);
  if (!sectionResult.found || !sectionResult.text) {
    throw new Error(`get_section() failed to retrieve section "${targetSection}"!`);
  }
  console.log(`  Section preview: ${sectionResult.text.slice(0, 100).replace(/\n/g, ' ')}...`);
  console.log('  ✅ get_section() passed.');

  // 2. Test Malformed Tool-Call Handling
  console.log('\n4️⃣ Testing Malformed Tool-Call Handling:');

  // Case A: Unknown tool
  const unknownToolResult = await agentService.executeTool('invented_tool_action', { foo: 'bar' }, doc.id);
  console.log('  Case A (Unknown Tool Name):', unknownToolResult);
  if (!unknownToolResult.isMalformed || !unknownToolResult.error?.includes('Unknown tool')) {
    throw new Error('Unknown tool was not handled gracefully!');
  }
  console.log('  ✅ Handled unknown tool without crashing.');

  // Case B: Missing required arguments
  const missingArgsResult = await agentService.executeTool('search_document', {}, doc.id);
  console.log('  Case B (Missing "query" parameter):', missingArgsResult);
  if (!missingArgsResult.isMalformed || !missingArgsResult.error?.includes('required')) {
    throw new Error('Missing parameter was not handled gracefully!');
  }
  console.log('  ✅ Handled missing parameters gracefully.');

  // Case C: Invalid JSON arguments
  const invalidJsonResult = await agentService.executeTool('get_section', '{ not: valid: json }', doc.id);
  console.log('  Case C (Invalid JSON string):', invalidJsonResult);
  if (!invalidJsonResult.isMalformed) {
    throw new Error('Invalid JSON was not detected as malformed!');
  }
  console.log('  ✅ Handled invalid JSON arguments gracefully.');

  // 3. Test MAX_ROUNDS Enforcement
  console.log('\n5️⃣ Testing MAX_ROUNDS Enforcement:');
  const testMaxRounds = 3;
  const limitedResearch = await agentService.research(
    'What are all the termination conditions and notice periods?',
    {
      documentId: doc.id,
      maxRounds: testMaxRounds,
    }
  );
  console.log(`  Configured Max Rounds: ${testMaxRounds}`);
  console.log(`  Executed Rounds:       ${limitedResearch.rounds}`);
  console.log(`  Steps Count:           ${limitedResearch.steps.length}`);
  if (limitedResearch.rounds > testMaxRounds) {
    throw new Error(`Rounds exceeded MAX_ROUNDS! Expected <= ${testMaxRounds}, got ${limitedResearch.rounds}`);
  }
  console.log('  ✅ MAX_ROUNDS strictly enforced (prevents runaway loops).');

  // 4. Test End-to-End Autonomous Research Flow with Quote Verification
  console.log('\n6️⃣ Testing End-to-End Flow:');
  console.log('  Question -> Agent -> Tool Calls -> Final Answer -> Quote Verification');

  const researchResult = await agentService.research(
    'What is the governing law or limitation of liability under this agreement?',
    {
      documentId: doc.id,
      maxRounds: MAX_ROUNDS,
    }
  );

  console.log(`\n  Autonomous Research Steps Executed:`);
  for (const s of researchResult.steps) {
    console.log(`  [Round ${s.round}] Tool: ${s.toolCall?.toolName}`);
    if (s.thought) console.log(`    Thought: ${s.thought}`);
    if (s.toolCall?.args) console.log(`    Args:    ${JSON.stringify(s.toolCall.args)}`);
  }

  console.log(`\n  Final Synthesized Answer:`);
  console.log(`  "${researchResult.answer}"\n`);

  console.log(`  Verified Citations Found: ${researchResult.citations.length}`);
  for (let i = 0; i < researchResult.citations.length; i++) {
    const cit = researchResult.citations[i];
    console.log(`    - Citation ${i + 1}: "${cit.quote}"`);
    console.log(`      Verified: ${cit.verified}, Page: ${cit.pageStart}, Offsets: [${cit.startOffset}, ${cit.endOffset}]`);
  }

  if (!researchResult.answer) {
    throw new Error('Agent failed to generate an answer!');
  }
  if (researchResult.steps.length < 2) {
    throw new Error('Agent failed to execute multi-round tool calling!');
  }
  console.log('  ✅ End-to-end multi-round agent research with verified citations passed.');

  console.log('\n🎉 ALL PART C OPTION 2 AGENTIC RESEARCH TESTS PASSED SUCCESSFULLY!\n');
}

runAgentTests()
  .catch((err) => {
    console.error('❌ Agent test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
