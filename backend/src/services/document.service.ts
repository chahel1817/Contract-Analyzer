import { prisma } from '../utils/prisma';

export class DocumentService {
  async getAllDocuments() {
    return prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDocumentById(id: string) {
    return prisma.document.findUnique({
      where: { id },
      include: { chunks: true },
    });
  }

  async deleteDocument(id: string) {
    return prisma.document.delete({
      where: { id },
    });
  }
}

export const documentService = new DocumentService();
