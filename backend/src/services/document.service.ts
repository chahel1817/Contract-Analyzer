import { prisma } from '../utils/prisma';
import fs from 'fs/promises';
import path from 'path';

export type DocumentStatus = 'PROCESSING' | 'READY' | 'FAILED';

export interface CreateDocumentInput {
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  extractedText?: string;
  pageCount?: number;
  status?: DocumentStatus | string;
  errorMessage?: string;
}

export class DocumentService {
  async createDocument(data: CreateDocumentInput) {
    return prisma.document.create({
      data: {
        title: data.title,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        filePath: data.filePath,
        extractedText: data.extractedText,
        pageCount: data.pageCount,
        status: data.status || 'PROCESSING',
        errorMessage: data.errorMessage,
      },
    });
  }

  async updateDocument(id: string, data: Partial<CreateDocumentInput>) {
    return prisma.document.update({
      where: { id },
      data: {
        title: data.title,
        status: data.status,
        extractedText: data.extractedText,
        pageCount: data.pageCount,
        errorMessage: data.errorMessage,
      },
    });
  }

  async getAllDocuments() {
    return prisma.document.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        status: true,
        pageCount: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            chunks: true,
            conversations: true,
          },
        },
      },
    });
  }

  async getDocumentById(id: string) {
    return prisma.document.findUnique({
      where: { id },
      include: {
        chunks: {
          orderBy: { chunkIndex: 'asc' },
        },
        conversations: {
          orderBy: { updatedAt: 'desc' },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              include: {
                citations: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteDocument(id: string) {
    const doc = await prisma.document.findUnique({ where: { id } });
    if (!doc) return null;

    // Delete database record (cascades to chunks, conversations, messages, citations)
    await prisma.document.delete({ where: { id } });

    // Clean up file on disk
    try {
      const fullPath = path.isAbsolute(doc.filePath)
        ? doc.filePath
        : path.join(process.cwd(), doc.filePath);
      await fs.unlink(fullPath);
    } catch {
      // Ignore if file already removed
    }

    return doc;
  }
}

export const documentService = new DocumentService();
