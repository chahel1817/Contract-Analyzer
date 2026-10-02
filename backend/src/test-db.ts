import { prisma } from './utils/prisma';

async function testDatabase() {
  console.log('Testing PostgreSQL + Prisma connection...');

  try {
    // 1. Create a test document
    console.log('1. Creating test document...');
    const doc = await prisma.document.create({
      data: {
        title: 'Master Services Agreement - Sample',
        fileName: 'msa_sample.pdf',
        fileType: 'application/pdf',
        fileSize: 102400,
        filePath: 'uploads/msa_sample.pdf',
        status: 'processed',
        extractedText: 'This Master Services Agreement is entered into by and between...',
        chunks: {
          create: [
            {
              chunkIndex: 0,
              content: 'This Master Services Agreement is entered into by and between Company A and Company B.',
              pageNumber: 1,
            },
          ],
        },
      },
      include: {
        chunks: true,
      },
    });
    console.log('✓ Document created successfully! ID:', doc.id);

    // 2. Read the document
    console.log('2. Reading document...');
    const fetched = await prisma.document.findUnique({
      where: { id: doc.id },
      include: { chunks: true },
    });
    console.log('✓ Document read successfully:', fetched?.title, 'with', fetched?.chunks.length, 'chunk(s)');

    // 3. Delete the document
    console.log('3. Deleting document...');
    await prisma.document.delete({
      where: { id: doc.id },
    });
    console.log('✓ Document deleted successfully!');

    console.log('\nAll CRUD database operations succeeded! Database is ready.');
  } catch (error) {
    console.error('Database test error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
