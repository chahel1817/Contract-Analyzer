import dotenv from 'dotenv';
dotenv.config();
import { aiService } from './services/ai.service';

async function testAiService() {
  console.log('====================================================');
  console.log('🤖 TESTING AI SERVICE: generateAnswer()');
  console.log('====================================================\n');

  const testChunks = [
    {
      id: 'chunk-1',
      pageStart: 1,
      text: 'Clause 7. Limitation of Liability. The total aggregate liability of the Supplier under this Agreement for any and all claims shall not exceed $250,000 USD or the total fees paid in the prior six months.',
    },
    {
      id: 'chunk-2',
      pageStart: 2,
      text: 'Clause 12. Term and Termination. This Agreement shall commence on January 1, 2026 and remain in effect for an initial term of three (3) years unless terminated earlier for material breach.',
    },
  ];

  const question = 'What is the liability cap for the supplier?';
  console.log(`Question: "${question}"`);
  console.log('Retrieved Chunks: 2 chunks provided.\n');

  const result = await aiService.generateAnswer(question, testChunks);

  console.log('Structured Output:');
  console.log(JSON.stringify(result, null, 2));

  // Verify structure
  const hasAnswer = typeof result.answer === 'string' && result.answer.length > 0;
  const hasQuotes = Array.isArray(result.quotes) && result.quotes.length > 0;
  const quoteHasText = hasQuotes && typeof result.quotes[0]?.text === 'string';

  console.log('\nValidation:');
  console.log(`- "answer" is non-empty string: ${hasAnswer ? '✅ YES' : '❌ NO'}`);
  console.log(`- "quotes" is an array: ${hasQuotes ? '✅ YES' : '❌ NO'}`);
  console.log(`- quotes item has "text" property: ${quoteHasText ? '✅ YES' : '❌ NO'}`);

  if (hasAnswer && hasQuotes && quoteHasText) {
    console.log('\n🎉 ALL AI SERVICE STRUCTURE TESTS PASSED!');
  } else {
    console.log('\n⚠️ Tests did not meet all structural criteria.');
  }
}

testAiService();
