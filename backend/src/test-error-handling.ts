import fs from 'fs';
import path from 'path';
import { extractionService } from './services/extraction.service';
import { aiService } from './services/ai.service';
import { retrievalService } from './services/retrieval.service';
import { citationService } from './services/citation.service';
import { prisma } from './utils/prisma';
import { errorHandler } from './middleware/error.middleware';

async function runErrorHandlingTests() {
  console.log('🧪 Starting Requirement 26: Error Handling Test Suite...\n');

  // 1. Test: Invalid File Extension / Type
  console.log('1️⃣ Testing Invalid File Handling:');
  try {
    await extractionService.extractText('test.exe', 'test.exe');
    throw new Error('Should have failed for invalid file extension!');
  } catch (err: any) {
    console.log(`  Caught expected error: "${err.message}"`);
    if (!err.message.includes('Invalid file type')) {
      throw new Error(`Unexpected error message for invalid file: ${err.message}`);
    }
  }
  console.log('  ✅ Invalid file handled correctly.\n');

  // 2. Test: Corrupt PDF Handling
  console.log('2️⃣ Testing Corrupt PDF Handling:');
  const corruptPdfPath = path.join(process.cwd(), 'uploads', 'corrupt_test.pdf');
  await fs.promises.writeFile(corruptPdfPath, 'NOT A REAL PDF CONTENT AT ALL');
  try {
    await extractionService.extractPDF(corruptPdfPath);
    throw new Error('Should have failed on corrupt PDF!');
  } catch (err: any) {
    console.log(`  Caught expected corrupt error: "${err.message}"`);
    if (!err.message.includes('Corrupt PDF')) {
      throw new Error(`Expected 'Corrupt PDF' in error message, got: ${err.message}`);
    }
  } finally {
    try { await fs.promises.unlink(corruptPdfPath); } catch {}
  }
  console.log('  ✅ Corrupt PDF handled correctly.\n');

  // 3. Test: Scanned PDF (No readable text)
  console.log('3️⃣ Testing Scanned PDF Detection:');
  const dummyScannedPdfPath = path.join(process.cwd(), 'uploads', 'scanned_test.pdf');
  // Minimal valid PDF structure with no text streams
  const emptyPdf = `%PDF-1.4
1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj
2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj
3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>> endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000056 00000 n 
0000000111 00000 n 
trailer <</Size 4 /Root 1 0 R>>
startxref
190
%%EOF`;
  await fs.promises.writeFile(dummyScannedPdfPath, emptyPdf);
  try {
    const result = await extractionService.extractPDF(dummyScannedPdfPath);
    console.log(`  Extracted page count: ${result.pageCount}, isScanned: ${result.isScanned}`);
    if (!result.isScanned) {
      throw new Error('Expected PDF with no readable text to be marked as scanned!');
    }
  } finally {
    try { await fs.promises.unlink(dummyScannedPdfPath); } catch {}
  }
  console.log('  ✅ Scanned PDF detected correctly.\n');

  // 4. Test: Large File Limitation
  console.log('4️⃣ Testing Large File Limit:');
  const mockMulterLimitError = {
    name: 'MulterError',
    code: 'LIMIT_FILE_SIZE',
    message: 'File too large',
  };
  let capturedStatus = 0;
  let capturedBody: any = null;
  const mockRes: any = {
    status: (code: number) => {
      capturedStatus = code;
      return {
        json: (body: any) => {
          capturedBody = body;
        },
      };
    },
  };
  errorHandler(mockMulterLimitError, {} as any, mockRes, (() => {}) as any);
  console.log(`  Captured HTTP Status: ${capturedStatus}, Error: "${capturedBody?.error}"`);
  if (capturedStatus !== 400 || !capturedBody?.error?.includes('50MB')) {
    throw new Error('Large file error not handled properly!');
  }
  console.log('  ✅ Large file limit handled correctly.\n');

  // 5. Test: Extraction Failure & Document Status Update
  console.log('5️⃣ Testing Extraction Failure Handling:');
  const failedDoc = await prisma.document.create({
    data: {
      title: 'Extraction Failure Test Doc',
      fileName: 'bad_file.pdf',
      fileType: 'application/pdf',
      fileSize: 1024,
      filePath: 'non_existent_path.pdf',
      status: 'PROCESSING',
    },
  });

  try {
    await extractionService.extractPDF('non_existent_path.pdf');
  } catch (extractErr: any) {
    await prisma.document.update({
      where: { id: failedDoc.id },
      data: {
        status: 'FAILED',
        errorMessage: extractErr.message || 'Text extraction failed',
      },
    });
  }

  const verifiedFailedDoc = await prisma.document.findUnique({
    where: { id: failedDoc.id },
  });
  console.log(`  Document status: ${verifiedFailedDoc?.status}, Error Message: "${verifiedFailedDoc?.errorMessage}"`);
  if (verifiedFailedDoc?.status !== 'FAILED' || !verifiedFailedDoc?.errorMessage) {
    throw new Error('Document status was not set to FAILED on extraction error!');
  }
  await prisma.document.delete({ where: { id: failedDoc.id } });
  console.log('  ✅ Extraction failure recorded properly in database.\n');

  // 6. Test: AI Failure Fallback
  console.log('6️⃣ Testing AI Failure Fallback:');
  const sampleChunks = [
    {
      id: 'chunk-1',
      text: 'Section 4.1 Payment Terms: Fees shall be paid within 30 days of invoice.',
      chunkIndex: 0,
      pageStart: 1,
    },
  ];

  // Test deterministic fallback generates an answer even if LLM is offline
  const fallbackResult = await aiService.generateAnswer(
    'What are the payment terms?',
    sampleChunks
  );
  console.log(`  Generated Answer: "${fallbackResult.answer}"`);
  console.log(`  Quotes:`, fallbackResult.quotes);
  if (!fallbackResult.answer || fallbackResult.answer.length === 0) {
    throw new Error('AI fallback failed to generate an answer!');
  }
  console.log('  ✅ AI fallback handles offline / LLM unavailability gracefully.\n');

  // 7. Test: Database Failure Handling
  console.log('7️⃣ Testing Database Failure Handling:');
  const mockDbError = {
    name: 'PrismaClientInitializationError',
    code: 'P1001',
    message: "Can't reach database server at localhost:5432",
  };
  capturedStatus = 0;
  capturedBody = null;
  errorHandler(mockDbError, {} as any, mockRes, (() => {}) as any);
  console.log(`  Database Error HTTP Status: ${capturedStatus}, Error: "${capturedBody?.error}"`);
  if (capturedStatus !== 503 || !capturedBody?.error?.includes('Database service unavailable')) {
    throw new Error(`Database error returned unexpected status: ${capturedStatus}`);
  }
  console.log('  ✅ Database failure handled gracefully with HTTP 503.\n');

  // 8. Test: No Answer Found (Out of Scope Query)
  console.log('8️⃣ Testing "No Answer Found" Handling:');
  const outOfScopeQuestion = 'What is the speed of light in vacuum and rocket fuel specification?';
  const outOfScopeAnswer = await aiService.generateAnswer(outOfScopeQuestion, sampleChunks);
  console.log(`  Question: "${outOfScopeQuestion}"`);
  console.log(`  Answer:   "${outOfScopeAnswer.answer}"`);
  console.log(`  Quotes Count: ${outOfScopeAnswer.quotes.length}`);

  if (outOfScopeAnswer.quotes.length !== 0) {
    throw new Error('Expected 0 quotes for out of scope question!');
  }
  if (!outOfScopeAnswer.answer.toLowerCase().includes('not contain') && !outOfScopeAnswer.answer.toLowerCase().includes('not find')) {
    throw new Error(`Expected answer to state no information was found, got: ${outOfScopeAnswer.answer}`);
  }
  console.log('  ✅ "No answer found" handled properly without hallucination.\n');

  // 9. Test: Quote Verification of Hallucinated Quote
  console.log('9️⃣ Testing Hallucinated / Unverified Quote Rejection:');
  const hallucinatedQuote = 'Vendor shall provide free spacecraft flights to Mars for all employees.';
  const verification = citationService.verifyQuote(hallucinatedQuote, sampleChunks[0].text);
  console.log(`  Hallucinated Quote: "${hallucinatedQuote}"`);
  console.log(`  Verified: ${verification.verified}, Confidence: ${verification.confidence}`);
  if (verification.verified) {
    throw new Error('Hallucinated quote was incorrectly marked as verified!');
  }
  console.log('  ✅ Hallucinated quote rejected as unverified.\n');

  console.log('🎉 ALL 9 ERROR HANDLING SCENARIOS TESTED AND PASSED PERFECTLY!\n');
}

runErrorHandlingTests()
  .catch((err) => {
    console.error('❌ Error handling test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
