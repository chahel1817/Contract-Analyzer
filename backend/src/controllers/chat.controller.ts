import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { retrievalService } from '../services/retrieval.service';
import { aiService } from '../services/ai.service';
import { citationService } from '../services/citation.service';

/**
 * POST /api/chat
 * Flow:
 * Question -> Retrieval -> AI -> Answer + candidate quotes -> Quote verification -> Citation storage -> Response
 */
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentId, question, message, conversationId, stream } = req.body;
    const query = (question || message || '').trim();
    const isStreamRequested = stream === true || req.headers.accept?.includes('text/event-stream');

    if (!documentId) {
      return res.status(400).json({ success: false, error: 'documentId is required' });
    }

    if (!query) {
      return res.status(400).json({ success: false, error: 'A question or message is required' });
    }

    // 1. Verify document exists and is processed
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { chunks: true },
    });

    if (!document) {
      return res.status(404).json({ success: false, error: `Document "${documentId}" not found.` });
    }

    if (document.status === 'FAILED') {
      return res.status(400).json({
        success: false,
        error: `Cannot chat with this document: ${document.errorMessage || 'Document processing failed.'}`,
      });
    }

    // 2. Resolve or create Conversation
    let conversation;
    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          documentId,
          title: query.length > 50 ? query.slice(0, 47) + '...' : query,
        },
      });
    }

    // 3. Save User Message
    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: query,
      },
    });

    const rawDocumentText = document.extractedText || '';

    // ==========================================
    // STREAMING FLOW (SSE)
    // ==========================================
    if (isStreamRequested) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const sendSse = (event: string, data: any) => {
        if (!res.writableEnded) {
          res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        }
      };

      // Send initial user message & conversation ID
      sendSse('userMessage', {
        conversationId: conversation.id,
        userMessage,
      });

      // 4. Retrieval: Search relevant chunks
      sendSse('status', { message: 'Searching contract clauses...' });
      const relevantChunks = await retrievalService.searchDocument(query, documentId, 5);
      sendSse('status', {
        message: `Found ${relevantChunks.length} relevant sections. Generating answer...`,
      });

      // Abort controller for Stop generation
      const abortController = new AbortController();
      let isAborted = false;
      req.on('close', () => {
        isAborted = true;
        abortController.abort();
      });

      // 5. Stream AI answer
      const aiResult = await aiService.streamAnswer(
        query,
        relevantChunks.map((c) => ({
          id: c.id,
          text: c.text,
          pageStart: c.pageStart,
          chunkIndex: c.chunkIndex,
        })),
        {
          signal: abortController.signal,
          onDelta: (delta: string) => {
            sendSse('delta', { text: delta });
          },
        }
      );

      if (isAborted) {
        return res.end();
      }

      // 6. Quote Verification: verify candidate quotes
      sendSse('status', { message: 'Verifying quotes against original document...' });
      const verifiedCitationsData = [];

      for (const candidateQuote of aiResult.candidateQuotes) {
        if (!candidateQuote || !candidateQuote.trim()) continue;

        const verification = citationService.verifyQuote(
          candidateQuote,
          rawDocumentText,
          document.chunks
        );

        verifiedCitationsData.push({
          documentId,
          quote: verification.quote,
          verified: verification.verified,
          isVerified: verification.verified,
          startOffset: verification.startOffset,
          endOffset: verification.endOffset,
          startIndex: verification.startOffset,
          endIndex: verification.endOffset,
          pageStart: verification.pageStart,
          pageEnd: verification.pageEnd,
          pageNumber: verification.pageStart,
          chunkId: verification.chunkId || null,
          confidence: verification.confidence,
        });
      }

      // 7. Citation storage: Save Assistant Message with verified citations
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: aiResult.answer,
          citations: {
            create: verifiedCitationsData,
          },
        },
        include: {
          citations: true,
        },
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });

      sendSse('done', {
        success: true,
        conversationId: conversation.id,
        userMessage,
        assistantMessage,
        answer: aiResult.answer,
        citations: assistantMessage.citations,
        retrievedChunksCount: relevantChunks.length,
      });

      return res.end();
    }

    // ==========================================
    // NON-STREAMING (STANDARD JSON)
    // ==========================================
    const relevantChunks = await retrievalService.searchDocument(query, documentId, 5);

    const aiResult = await aiService.generateAnswer(
      query,
      relevantChunks.map((c) => ({
        id: c.id,
        text: c.text,
        pageStart: c.pageStart,
        chunkIndex: c.chunkIndex,
      }))
    );

    const verifiedCitationsData = [];

    for (const candQuote of aiResult.quotes) {
      if (!candQuote.text || candQuote.text.trim().length === 0) continue;

      const verification = citationService.verifyQuote(
        candQuote.text,
        rawDocumentText,
        document.chunks
      );

      verifiedCitationsData.push({
        documentId,
        quote: verification.quote,
        verified: verification.verified,
        isVerified: verification.verified,
        startOffset: verification.startOffset,
        endOffset: verification.endOffset,
        startIndex: verification.startOffset,
        endIndex: verification.endOffset,
        pageStart: verification.pageStart,
        pageEnd: verification.pageEnd,
        pageNumber: verification.pageStart,
        chunkId: verification.chunkId || null,
        confidence: verification.confidence,
      });
    }

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: aiResult.answer,
        citations: {
          create: verifiedCitationsData,
        },
      },
      include: {
        citations: true,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return res.status(200).json({
      success: true,
      conversationId: conversation.id,
      userMessage,
      assistantMessage,
      answer: aiResult.answer,
      citations: assistantMessage.citations,
      retrievedChunksCount: relevantChunks.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/conversations/:documentId
 * Returns conversation history with messages and citations for a document.
 */
export const getConversationsByDocument = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const documentId = req.params.documentId as string;

    if (!documentId) {
      return res.status(400).json({ success: false, error: 'documentId is required' });
    }

    const conversations = await prisma.conversation.findMany({
      where: { documentId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            citations: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      count: conversations.length,
      data: conversations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/chat/search
 * Searches document chunks without invoking AI.
 */
export const searchDocumentChunks = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentId, query, limit } = req.body;

    if (!documentId) {
      return res.status(400).json({ success: false, error: 'documentId is required' });
    }
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ success: false, error: 'query is required' });
    }

    const chunks = await retrievalService.searchDocument(
      query.trim(),
      documentId,
      limit ? Number(limit) : 5
    );

    return res.status(200).json({
      success: true,
      query,
      count: chunks.length,
      data: chunks,
    });
  } catch (error) {
    next(error);
  }
};

export const getChatHistory = getConversationsByDocument;
