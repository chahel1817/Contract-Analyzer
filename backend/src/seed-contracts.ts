import { prisma } from './utils/prisma';

async function seed() {
  console.log('Seeding demo contracts for comparison...');

  const contractV1Text = `
1. DEFINITIONS AND INTERPRETATION
In this Agreement, "Confidential Information" means all non-public proprietary data, source code, and customer records disclosed by either party.

2. PAYMENT AND COMPENSATION
Customer shall pay Vendor the fixed fee of AED 100,000 within thirty (30) days of invoice date. Late payments incur interest at 1.5% per month.

3. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and remain in effect for two (2) years. Either party may terminate this Agreement for convenience upon sixty (60) days prior written notice.

4. LIMITATION OF LIABILITY
Vendor's total aggregate liability arising out of or related to this Agreement shall be strictly capped at AED 100,000. Under no circumstances will Vendor be liable for special, incidental, or consequential damages.

5. GOVERNING LAW AND JURISDICTION
This Agreement shall be governed by and construed in accordance with the laws of the Dubai International Financial Centre (DIFC). The courts of DIFC shall have exclusive jurisdiction.
`.trim();

  const contractV2Text = `
1. DEFINITIONS AND INTERPRETATION
In this Agreement, "Confidential Information" means all non-public proprietary data, source code, trade secrets, and customer records disclosed by either party.

2. PAYMENT AND COMPENSATION
Customer shall pay Vendor the revised fee of AED 250,000 within thirty (30) days of invoice date. Late payments incur interest at 2.5% per month.

3. TERM AND TERMINATION
This Agreement shall commence on the Effective Date and remain in effect for two (2) years. Either party may terminate this Agreement for convenience upon five (5) days prior written notice.

4. LIMITATION OF LIABILITY
Vendor's total aggregate liability arising out of or related to this Agreement shall be capped at AED 1,000,000. Vendor shall not be liable for special, incidental, or consequential damages.

6. DATA PROTECTION AND COMPLIANCE
Vendor warrants full compliance with applicable UAE Federal Data Protection Law and will maintain industry-standard ISO 27001 certifications.
`.trim();

  const docA = await prisma.document.create({
    data: {
      title: 'Master Services Agreement (v1.0 - Base)',
      fileName: 'msa_v1.0.pdf',
      fileType: 'application/pdf',
      fileSize: 104857,
      filePath: 'uploads/demo_msa_v1.pdf',
      extractedText: contractV1Text,
      pageCount: 3,
      status: 'READY',
      chunks: {
        create: [
          {
            chunkIndex: 0,
            text: contractV1Text.slice(0, 500),
            pageStart: 1,
            pageEnd: 1,
          },
          {
            chunkIndex: 1,
            text: contractV1Text.slice(450),
            pageStart: 2,
            pageEnd: 3,
          },
        ],
      },
    },
  });

  const docB = await prisma.document.create({
    data: {
      title: 'Master Services Agreement (v2.0 - Revised)',
      fileName: 'msa_v2.0.pdf',
      fileType: 'application/pdf',
      fileSize: 112640,
      filePath: 'uploads/demo_msa_v2.pdf',
      extractedText: contractV2Text,
      pageCount: 3,
      status: 'READY',
      chunks: {
        create: [
          {
            chunkIndex: 0,
            text: contractV2Text.slice(0, 500),
            pageStart: 1,
            pageEnd: 1,
          },
          {
            chunkIndex: 1,
            text: contractV2Text.slice(450),
            pageStart: 2,
            pageEnd: 3,
          },
        ],
      },
    },
  });

  console.log(`Seeded Document A: ${docA.id} (${docA.title})`);
  console.log(`Seeded Document B: ${docB.id} (${docB.title})`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
