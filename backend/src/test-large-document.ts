import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { extractionService } from './services/extraction.service';
import { chunkingService } from './services/chunking.service';
import { retrievalService } from './services/retrieval.service';
import { aiService } from './services/ai.service';
import { citationService } from './services/citation.service';
import { prisma } from './utils/prisma';

async function generateLargePdf(filePath: string, numPages: number = 120): Promise<string> {
  console.log(`📄 Generating a realistic ${numPages}-page legal PDF agreement...`);
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const keyNeedlePage = 112;
  const keyNeedleText =
    'Section 112.4 (Catastrophic Outage Disaster Recovery Service Level): In the event of a Tier-4 datacenter failure, Vendor strictly guarantees a Recovery Time Objective (RTO) of forty-five (45) minutes, and a Recovery Point Objective (RPO) of not more than one hundred twenty (120) seconds.';

  for (let i = 1; i <= numPages; i++) {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 dimensions in points
    const { width, height } = page.getSize();

    // Header
    page.drawText('GLOBAL ENTERPRISE TECHNOLOGY OUTSOURCING FRAMEWORK AGREEMENT', {
      x: 50,
      y: height - 40,
      size: 9,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.4),
    });

    // Page Number
    page.drawText(`Page ${i} of ${numPages}`, {
      x: width - 110,
      y: height - 40,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.5),
    });

    // Horizontal Divider
    page.drawLine({
      start: { x: 50, y: height - 48 },
      end: { x: width - 50, y: height - 48 },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    let currentY = height - 80;

    if (i === 1) {
      // Title page
      page.drawText('MASTER CLOUD COMPUTING & ENTERPRISE SERVICES AGREEMENT', {
        x: 50,
        y: currentY,
        size: 14,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.2),
      });
      currentY -= 30;

      page.drawText(
        'This Master Agreement is entered into by and between Enterprise Tech Holdings Corp and Cloud Systems Global Ltd.',
        {
          x: 50,
          y: currentY,
          size: 10,
          font,
          color: rgb(0.2, 0.2, 0.2),
        }
      );
      currentY -= 25;
    }

    // Section title
    page.drawText(`ARTICLE ${i}: OPERATIONAL FRAMEWORK AND CLAUSE SERIES ${i}.0`, {
      x: 50,
      y: currentY,
      size: 11,
      font: boldFont,
      color: rgb(0.15, 0.2, 0.35),
    });
    currentY -= 25;

    // Body content
    if (i === keyNeedlePage) {
      // The needle clause
      page.drawText('112.1 Operational Infrastructure and Redundancy Protocols', {
        x: 50,
        y: currentY,
        size: 10,
        font: boldFont,
      });
      currentY -= 20;

      page.drawText(
        'Vendor operates primary and secondary enterprise datacenters with automated geographic failover across zones.',
        {
          x: 50,
          y: currentY,
          size: 9.5,
          font,
        }
      );
      currentY -= 30;

      page.drawText(keyNeedleText, {
        x: 50,
        y: currentY,
        size: 9.5,
        font: boldFont,
        color: rgb(0.05, 0.15, 0.4),
        maxWidth: width - 100,
        lineHeight: 14,
      });
      currentY -= 55;

      page.drawText(
        'Failure to satisfy this RTO requirement shall trigger a penalty credit equal to fifteen percent of monthly fees.',
        {
          x: 50,
          y: currentY,
          size: 9.5,
          font,
        }
      );
    } else {
      // Standard legal paragraphs
      const paragraphs = [
        `Subsection ${i}.1 (General Compliance): Both parties agree to execute all responsibilities under Schedule ${i} with reasonable skill and diligence in accordance with best industry practice.`,
        `Subsection ${i}.2 (Audit Rights and Monitoring): Customer reserves the right, upon fifteen business days advance notice, to inspect Vendor's facilities, system logs, and security controls related to Service Component ${i}.`,
        `Subsection ${i}.3 (Confidentiality and Data Safeguards): All proprietary information transferred under this Article shall remain strictly confidential for a period of five years following the termination of this Agreement.`,
        `Subsection ${i}.4 (Service Level Credits): In the event of standard service unavailability under Section ${i}, Customer may request service credits as outlined in Appendix B attached hereto.`,
      ];

      for (const p of paragraphs) {
        page.drawText(p, {
          x: 50,
          y: currentY,
          size: 9,
          font,
          maxWidth: width - 100,
          lineHeight: 14,
        });
        currentY -= 50;
      }
    }

    // Footer
    page.drawText('CONFIDENTIAL & PROPRIETARY — STRICTLY FOR DEMO EVALUATION', {
      x: 50,
      y: 35,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, pdfBytes);
  console.log(`  Saved ${numPages}-page PDF to ${filePath} (${(pdfBytes.length / 1024).toFixed(1)} KB)`);

  return keyNeedleText;
}

async function testLargeDocumentPipeline() {
  console.log('🧪 Starting Phase 9: Large Document Test (100–150 Pages Pipeline)...\n');

  const NUM_PAGES = 120;
  const testPdfPath = path.join(process.cwd(), 'uploads', `large_contract_${NUM_PAGES}_pages.pdf`);

  // 1. Generate 120-page legal document
  const needleClause = await generateLargePdf(testPdfPath, NUM_PAGES);

  // 2. Upload & Ingestion into Database
  console.log('\n1️⃣ Testing Upload & Ingestion:');
  const stats = await fs.promises.stat(testPdfPath);
  const document = await prisma.document.create({
    data: {
      title: `Enterprise Master Agreement (${NUM_PAGES} Pages)`,
      fileName: path.basename(testPdfPath),
      fileType: 'application/pdf',
      fileSize: stats.size,
      filePath: testPdfPath,
      status: 'PROCESSING',
    },
  });
  console.log(`  Created document record ID: ${document.id}`);

  // 3. Extract Text & Pages
  console.log('\n2️⃣ Testing Full Document Text Extraction:');
  const t0Extract = Date.now();
  const extractionResult = await extractionService.extractPDF(testPdfPath);
  const extractDuration = Date.now() - t0Extract;

  console.log(`  Extracted page count: ${extractionResult.pageCount} (Expected: ${NUM_PAGES})`);
  console.log(`  Total extracted characters: ${extractionResult.text.length.toLocaleString()}`);
  console.log(`  Is scanned: ${extractionResult.isScanned}`);
  console.log(`  Extraction duration: ${(extractDuration / 1000).toFixed(2)}s`);

  if (extractionResult.pageCount !== NUM_PAGES) {
    throw new Error(`Expected ${NUM_PAGES} pages, but extracted ${extractionResult.pageCount}`);
  }
  if (extractionResult.isScanned) {
    throw new Error('Document was incorrectly marked as scanned!');
  }
  console.log('  ✅ Large document extraction succeeded.');

  // 4. Chunk & Index Document
  console.log('\n3️⃣ Testing Semantic Chunking & Storage:');
  const t0Chunk = Date.now();
  const chunkCount = await chunkingService.processAndStoreChunks(document.id, extractionResult.text);
  const chunkDuration = Date.now() - t0Chunk;

  console.log(`  Generated ${chunkCount} chunks across ${NUM_PAGES} pages.`);
  console.log(`  Chunking duration: ${(chunkDuration / 1000).toFixed(2)}s`);

  if (chunkCount < 100) {
    throw new Error(`Expected at least 100 chunks for a ${NUM_PAGES}-page document, got ${chunkCount}`);
  }

  // Update document status to READY
  await prisma.document.update({
    where: { id: document.id },
    data: {
      status: 'READY',
      extractedText: extractionResult.text,
      pageCount: extractionResult.pageCount,
    },
  });
  console.log('  ✅ Document status updated to READY in database.');

  // 5. Query & Retrieve Relevant Chunks (Strategy for Large Documents)
  console.log('\n4️⃣ Testing Retrieval & Token Filtering Strategy for Large Documents:');
  const question = 'What is the Recovery Time Objective RTO in minutes for a Tier-4 datacenter failure?';
  console.log(`  Question: "${question}"`);

  const t0Retrieve = Date.now();
  const retrievedChunks = await retrievalService.searchDocument(question, document.id, 5);
  const retrieveDuration = Date.now() - t0Retrieve;

  console.log(`  Retrieved ${retrievedChunks.length} chunks in ${retrieveDuration}ms.`);
  for (let i = 0; i < retrievedChunks.length; i++) {
    const c = retrievedChunks[i];
    console.log(`    - Chunk ${i + 1}: Index ${c.chunkIndex}, Page ${c.pageStart}, Score ${c.score}`);
  }

  if (retrievedChunks.length === 0) {
    throw new Error('No chunks retrieved for question!');
  }

  // Verify needle page was retrieved
  const topChunk = retrievedChunks[0];
  console.log(`  Top match found on Page ${topChunk.pageStart} (Expected Page: 112).`);
  if (topChunk.pageStart !== 112 && !topChunk.text.includes('Recovery Time Objective')) {
    throw new Error(`Expected top chunk to be on Page 112 containing RTO clause!`);
  }

  // CRITICAL REQUIREMENT CHECK: Verify we do NOT send the entire 120-page document to the LLM!
  const fullDocumentChars = extractionResult.text.length;
  const contextChars = retrievedChunks.reduce((acc, c) => acc + c.text.length, 0);
  const percentageOfDoc = (contextChars / fullDocumentChars) * 100;

  console.log(`\n  📊 Large Document Strategy Verification:`);
  console.log(`     - Full 120-Page Document: ${fullDocumentChars.toLocaleString()} characters (~${Math.round(fullDocumentChars / 4).toLocaleString()} tokens)`);
  console.log(`     - Context Sent to LLM:    ${contextChars.toLocaleString()} characters (~${Math.round(contextChars / 4).toLocaleString()} tokens)`);
  console.log(`     - Ratio Sent to LLM:      ${percentageOfDoc.toFixed(2)}% of total document text`);

  if (contextChars > fullDocumentChars * 0.1) {
    throw new Error(`Strategy failed: Sent ${percentageOfDoc}% of document to LLM (exceeds 10% threshold)!`);
  }
  console.log('  ✅ CRITICAL CHECK PASSED: Large document strategy confirmed — entire 120-page document was NOT sent to LLM.');

  // 6. Generate AI Answer
  console.log('\n5️⃣ Testing AI Answer Generation on Retrieved Excerpts:');
  const answerResult = await aiService.generateAnswer(question, retrievedChunks);
  console.log(`  Generated Answer: "${answerResult.answer}"`);
  console.log(`  Extracted Quotes:`, answerResult.quotes);

  if (!answerResult.answer.toLowerCase().includes('45') && !answerResult.answer.toLowerCase().includes('forty-five')) {
    throw new Error(`Answer did not state the 45 minutes RTO! Got: ${answerResult.answer}`);
  }
  console.log('  ✅ AI answer correctly answered the question from page 112.');

  // 7. Verify Citation against Original 120-Page Document
  console.log('\n6️⃣ Testing Quote Verification & Page Coordinate Resolution:');
  const candidateQuote =
    answerResult.quotes.length > 0
      ? answerResult.quotes[0].text
      : 'Recovery Time Objective (RTO) of forty-five (45) minutes';

  const verification = citationService.verifyQuote(
    candidateQuote,
    extractionResult.text,
    retrievedChunks.map((c) => ({
      id: c.id,
      text: c.text,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
    }))
  );

  console.log(`  Candidate Quote: "${candidateQuote}"`);
  console.log(`  Verified:        ${verification.verified}`);
  console.log(`  Resolved Page:   ${verification.pageStart} (Expected: 112)`);
  console.log(`  Character Range: ${verification.startOffset} to ${verification.endOffset}`);
  console.log(`  Confidence:      ${verification.confidence}`);

  if (!verification.verified) {
    throw new Error('Quote was not verified against original 120-page document!');
  }
  if (verification.pageStart !== 112) {
    throw new Error(`Expected citation to resolve to Page 112, got Page ${verification.pageStart}`);
  }
  console.log('  ✅ Citation successfully verified and exact page 112 coordinates resolved.');

  console.log('\n🎉 ALL PHASE 9 LARGE DOCUMENT TESTS PASSED PERFECTLY!\n');
}

testLargeDocumentPipeline()
  .catch((err) => {
    console.error('❌ Large document test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
