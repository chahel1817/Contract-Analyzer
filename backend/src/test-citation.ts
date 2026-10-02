import { citationService } from './services/citation.service';

async function testQuoteVerification() {
  console.log('====================================================');
  console.log('🔍 TESTING QUOTE VERIFICATION: citation.service.ts');
  console.log('====================================================\n');

  const contractDocument = `
[[PAGE_1]]
EMPLOYMENT AND CONFIDENTIALITY AGREEMENT

Section 1. Non-Disclosure Obligations.
The Employee agrees that during and after employment, the Employee shall hold in the strictest confidence all Proprietary Information of the Employer, and shall not disclose such information to any third party without prior written authorization.

Section 2. Non-Compete and Covenant.
For a period of twelve (12) months following termination of employment, Employee shall not directly or indirectly engage in any business competitive with Employer within the territory.

[[PAGE_2]]
Section 3. Governing Law and Severability.
This Agreement shall be construed, interpreted, and governed by the laws of the State of New York. In the event any provision is held invalid, the remainder shall continue in full force and effect.
`;

  // Test 1: Verbatim quote from page 1
  console.log('--- Test 1: Verbatim Quote ---');
  const quote1 = 'Employee shall hold in the strictest confidence all Proprietary Information of the Employer';
  const result1 = citationService.verifyQuote(quote1, contractDocument);
  console.log('Candidate Quote:', quote1);
  console.log('Verification Result:', result1);
  console.log(`- Verified: ${result1.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Page Start: ${result1.pageStart} (Expected: 1)`);
  console.log(`- Extracted from raw text at offsets: [${result1.startOffset}, ${result1.endOffset}]\n`);

  // Test 2: Quote with irregular line breaks and multiple spaces (whitespace difference)
  console.log('--- Test 2: Whitespace & Linebreak Variations ---');
  const quote2 = 'Employee\nshall   not   directly\nor  indirectly  engage\n\nin any business competitive';
  const result2 = citationService.verifyQuote(quote2, contractDocument);
  console.log('Candidate Quote with line breaks & multi-spaces:', JSON.stringify(quote2));
  console.log('Verification Result:', result2);
  console.log(`- Verified across linebreaks: ${result2.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Resolved exact raw slice: "${contractDocument.slice(result2.startOffset!, result2.endOffset!)}"\n`);

  // Test 3: Quote on Page 2
  console.log('--- Test 3: Page 2 Coordinate Detection ---');
  const quote3 = 'This Agreement shall be construed, interpreted, and governed by the laws of the State of New York.';
  const result3 = citationService.verifyQuote(quote3, contractDocument);
  console.log('Candidate Quote:', quote3);
  console.log('Verification Result:', result3);
  console.log(`- Verified: ${result3.verified ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`- Detected Page: ${result3.pageStart} (Expected: 2): ${result3.pageStart === 2 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Test 4: Hallucinated / Invented Quote
  console.log('--- Test 4: Hallucinated / Fabricated Quote ---');
  const quote4 = 'The employee shall receive a guaranteed annual bonus of 100,000 USD.';
  const result4 = citationService.verifyQuote(quote4, contractDocument);
  console.log('Fake Candidate Quote:', quote4);
  console.log('Verification Result:', result4);
  console.log(`- Correctly Rejected as Unverified: ${!result4.verified ? '✅ PASS' : '❌ FAIL'}\n`);

  if (result1.verified && result2.verified && result3.verified && result3.pageStart === 2 && !result4.verified) {
    console.log('🎉 ALL QUOTE VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } else {
    console.log('⚠️ Some verification tests failed.');
  }
}

testQuoteVerification();
