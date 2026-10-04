import { prisma } from '../utils/prisma';

export interface ChunkData {
  documentId: string;
  text: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  charStart: number;
  charEnd: number;
  sectionNumber?: string | null;
  sectionTitle?: string | null;
}

interface SectionLocation {
  sectionNumber: string;
  sectionTitle: string;
  charOffset: number;
}

export class ChunkingService {
  /**
   * Scans extracted text for numbered sections and schedule/attachment headings
   */
  private detectSectionLocations(extractedText: string): SectionLocation[] {
    const locations: SectionLocation[] = [];

    // 1. Numbered sections: e.g. "10. TERMINATION." or "1. DEFINITIONS" or "6. OWNERSHIP AND INTELLECTUAL PROPERTY."
    const secRegex = /(?:^|\n)\s*(\d{1,2})\.\s+([A-Za-z\s/&-]{3,50})(?:\.|\n|$)/g;
    let m: RegExpExecArray | null;
    while ((m = secRegex.exec(extractedText)) !== null) {
      locations.push({
        sectionNumber: m[1],
        sectionTitle: m[2].trim(),
        charOffset: m.index,
      });
    }

    // 2. Attachments / Schedules / Exhibits: e.g. "ATTACHMENT D - PROFESSIONAL SERVICES"
    const schRegex = /(?:^|\n)\s*(?:ATTACHMENT|SCHEDULE|EXHIBIT)\s+([A-Z0-9]+)\s*[:–-]?\s*([A-Z\s/&-]{3,45})/gi;
    while ((m = schRegex.exec(extractedText)) !== null) {
      locations.push({
        sectionNumber: `Schedule ${m[1].toUpperCase()}`,
        sectionTitle: m[2].trim(),
        charOffset: m.index,
      });
    }

    return locations.sort((a, b) => a.charOffset - b.charOffset);
  }

  /**
   * Resolves the active section for a given character interval
   */
  private resolveSectionForInterval(
    charStart: number,
    charEnd: number,
    locations: SectionLocation[]
  ): { sectionNumber: string | null; sectionTitle: string | null } {
    if (locations.length === 0) {
      return { sectionNumber: null, sectionTitle: null };
    }

    // Check if a section header begins inside this chunk
    for (let i = locations.length - 1; i >= 0; i--) {
      if (locations[i].charOffset >= charStart && locations[i].charOffset < charEnd) {
        return {
          sectionNumber: locations[i].sectionNumber,
          sectionTitle: locations[i].sectionTitle,
        };
      }
    }

    // Otherwise find the most recent section preceding charStart
    for (let i = locations.length - 1; i >= 0; i--) {
      if (locations[i].charOffset <= charStart) {
        return {
          sectionNumber: locations[i].sectionNumber,
          sectionTitle: locations[i].sectionTitle,
        };
      }
    }

    return { sectionNumber: null, sectionTitle: null };
  }

  /**
   * Splits extracted contract text into section-aware structured chunks
   */
  createChunks(documentId: string, extractedText: string, chunkSize: number = 1000, overlap: number = 150): ChunkData[] {
    const chunks: ChunkData[] = [];
    if (!extractedText || extractedText.trim().length === 0) {
      return chunks;
    }

    const sectionLocations = this.detectSectionLocations(extractedText);
    const hasPageMarkers = extractedText.includes('[[PAGE_');

    if (hasPageMarkers) {
      const pageRegex = /\[\[PAGE_(\d+)\]\]\s*([\s\S]*?)(?=(?:\[\[PAGE_\d+\]\]|$))/g;
      let match: RegExpExecArray | null;
      let globalCharOffset = 0;
      let chunkIdx = 0;

      while ((match = pageRegex.exec(extractedText)) !== null) {
        const pageNum = parseInt(match[1] || '1', 10);
        const pageContent = match[2] || '';
        let start = 0;

        while (start < pageContent.length) {
          let end = Math.min(start + chunkSize, pageContent.length);

          if (end < pageContent.length) {
            const lastPeriod = pageContent.lastIndexOf('. ', end);
            const lastNewline = pageContent.lastIndexOf('\n', end);
            const breakPoint = Math.max(lastPeriod + 1, lastNewline);
            if (breakPoint > start + chunkSize * 0.5) {
              end = breakPoint;
            }
          }

          const chunkText = pageContent.slice(start, end).trim();
          if (chunkText.length > 0) {
            const absCharStart = globalCharOffset + start;
            const absCharEnd = globalCharOffset + end;
            const sec = this.resolveSectionForInterval(absCharStart, absCharEnd, sectionLocations);

            chunks.push({
              documentId,
              text: chunkText,
              chunkIndex: chunkIdx++,
              pageStart: pageNum,
              pageEnd: pageNum,
              charStart: absCharStart,
              charEnd: absCharEnd,
              sectionNumber: sec.sectionNumber,
              sectionTitle: sec.sectionTitle,
            });
          }

          start += chunkSize - overlap;
          if (start >= pageContent.length || chunkSize <= overlap) break;
        }

        globalCharOffset += pageContent.length;
      }
    } else {
      let start = 0;
      let chunkIdx = 0;
      const charsPerPage = 2500;

      while (start < extractedText.length) {
        let end = Math.min(start + chunkSize, extractedText.length);

        if (end < extractedText.length) {
          const lastPeriod = extractedText.lastIndexOf('. ', end);
          const lastNewline = extractedText.lastIndexOf('\n', end);
          const breakPoint = Math.max(lastPeriod + 1, lastNewline);
          if (breakPoint > start + chunkSize * 0.5) {
            end = breakPoint;
          }
        }

        const chunkText = extractedText.slice(start, end).trim();
        if (chunkText.length > 0) {
          const pageStart = Math.floor(start / charsPerPage) + 1;
          const pageEnd = Math.floor(end / charsPerPage) + 1;
          const sec = this.resolveSectionForInterval(start, end, sectionLocations);

          chunks.push({
            documentId,
            text: chunkText,
            chunkIndex: chunkIdx++,
            pageStart,
            pageEnd,
            charStart: start,
            charEnd: end,
            sectionNumber: sec.sectionNumber,
            sectionTitle: sec.sectionTitle,
          });
        }

        start += chunkSize - overlap;
        if (start >= extractedText.length || chunkSize <= overlap) break;
      }
    }

    return chunks;
  }

  /**
   * Flow:
   * extractedText -> section-aware chunks -> DocumentChunk table
   */
  async processAndStoreChunks(documentId: string, extractedText: string): Promise<number> {
    const chunks = this.createChunks(documentId, extractedText);

    // Remove any previous chunks for idempotency
    await prisma.documentChunk.deleteMany({
      where: { documentId },
    });

    if (chunks.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        await prisma.documentChunk.createMany({
          data: batch.map((c) => ({
            documentId: c.documentId,
            text: c.text,
            content: c.text,
            chunkIndex: c.chunkIndex,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            charStart: c.charStart,
            charEnd: c.charEnd,
            pageNumber: c.pageStart,
            sectionNumber: c.sectionNumber || null,
            sectionTitle: c.sectionTitle || null,
          })),
        });
      }
    }

    return chunks.length;
  }

  /**
   * Re-chunks an existing document in the database with section metadata
   */
  async reindexDocument(documentId: string): Promise<number> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: { id: true, extractedText: true },
    });

    if (!doc || !doc.extractedText) return 0;
    return this.processAndStoreChunks(doc.id, doc.extractedText);
  }

  /**
   * Re-indexes all existing documents in the database
   */
  async reindexAllDocuments(): Promise<Record<string, number>> {
    const docs = await prisma.document.findMany({
      select: { id: true, extractedText: true },
    });

    const results: Record<string, number> = {};
    for (const d of docs) {
      if (d.extractedText) {
        results[d.id] = await this.processAndStoreChunks(d.id, d.extractedText);
      }
    }
    return results;
  }
}

export const chunkingService = new ChunkingService();
