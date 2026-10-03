import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';
import { retrievalService } from '../services/retrieval.service';
import { aiService } from '../services/ai.service';
import { citationService } from '../services/citation.service';
import { agentService } from '../services/agent.service';

/**
 * POST /api/chat
 * Flow:
 * Question -> Retrieval -> AI -> Answer + candidate quotes -> Quote verification -> Citation storage -> Response
 */
export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { documentId, documentIds, question, message, conversationId, stream } = req.body;
    const query = (question || message || '').trim();
    const isStreamRequested = stream === true || req.headers.accept?.includes('text/event-stream');

    const targetDocIds: string[] =
      Array.isArray(documentIds) && documentIds.length > 0
        ? documentIds
        : documentId
        ? [documentId]
        : [];

    if (targetDocIds.length === 0) {
      return res.status(400).json({ success: false, error: 'documentId or documentIds array is required' });
    }

    if (!query) {
      return res.status(400).json({ success: false, error: 'A question or message is required' });
    }

    // 1. Verify documents exist and fetch chunks
    const documents = await prisma.document.findMany({
      where: { id: { in: targetDocIds } },
      include: { chunks: true },
    });

    if (documents.length === 0) {
      return res.status(404).json({ success: false, error: 'No documents found for provided IDs.' });
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
          documentId: targetDocIds[0] || null,
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

    // 4. Per-document retrieval: document 1 -> retrieve, document 2 -> retrieve, ...
    interface TaggedChunk {
      id: string;
      documentId: string;
      documentTitle: string;
      text: string;
      pageStart?: number | null;
      chunkIndex: number;
    }

    // 4. Formulate Question Plan & Classify Query
    const plan = retrievalService.createQuestionPlan(query);
    const classification = retrievalService.classifyQuery(query);
    const chunkLimit = classification.type === 'SPECIFIC' ? 5 : 10;

    const allRetrievedChunks: TaggedChunk[] = [];
    const perDocCount: Record<string, number> = {};

    for (const doc of documents) {
      if (doc.status === 'FAILED') continue;
      const chunks = plan.isMultiPart
        ? await retrievalService.retrieveForQuestionPlan(plan, doc.id, chunkLimit)
        : await retrievalService.retrieveWithClassification(query, doc.id, classification, chunkLimit);
      perDocCount[doc.id] = chunks.length;
      for (const c of chunks) {
        allRetrievedChunks.push({
          id: c.id,
          documentId: doc.id,
          documentTitle: doc.title || doc.fileName,
          text: c.text,
          pageStart: c.pageStart,
          chunkIndex: c.chunkIndex,
        });
      }
    }

    // 5. Re-ranking: Order retrieved chunks by strict distinctive relevance & phrase density
    const rankedChunks = retrievalService.rerankChunks(
      query,
      allRetrievedChunks as any,
      classification,
      plan
    ) as TaggedChunk[];

    // 6. Evidence Sufficiency Check (Answerability Gate):
    const sufficiency = citationService.checkEvidenceSufficiency(query, rankedChunks, classification);

    interface VerifiedCitationRecord {
      documentId: string;
      documentTitle: string;
      quote: string;
      verified: boolean;
      isVerified: boolean;
      startOffset: number;
      endOffset: number;
      startIndex: number;
      endIndex: number;
      pageStart?: number | null;
      pageEnd?: number | null;
      pageNumber?: number | null;
      chunkId: string | null;
      confidence: number;
    }

    // Helper to verify candidate quotes against each document
    // "Every citation retains its documentId and is verified against that document only."
    const verifyCandidateQuoteAcrossDocuments = (candidateQuote: string): VerifiedCitationRecord | null => {
      for (const doc of documents) {
        const rawDocText = doc.extractedText || '';
        const verification = citationService.verifyQuote(candidateQuote, rawDocText, doc.chunks);
        if (verification.verified && verification.startOffset !== null && verification.endOffset !== null) {
          return {
            documentId: doc.id,
            documentTitle: doc.title || doc.fileName,
            quote: verification.quote,
            verified: true,
            isVerified: true,
            startOffset: verification.startOffset,
            endOffset: verification.endOffset,
            startIndex: verification.startOffset,
            endIndex: verification.endOffset,
            pageStart: verification.pageStart,
            pageEnd: verification.pageEnd,
            pageNumber: verification.pageStart,
            chunkId: verification.chunkId || null,
            confidence: verification.confidence,
          };
        }
      }

      // Not found in any of the selected documents (hallucinated / unverified) -> return null to drop
      return null;
    };

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

      sendSse('userMessage', {
        conversationId: conversation.id,
        userMessage,
      });

      if (plan.isMultiPart) {
        const sectionsList = Array.from(new Set(plan.parts.flatMap((p) => p.sectionNumbers || []))).join(', ');
        sendSse('status', {
          message: `Multi-part question detected (${plan.parts.length} parts: ${plan.parts.map((p) => p.topic).join(', ')}). Formulated QuestionPlan targeting Sections [${sectionsList}]...`,
        });
      } else {
        sendSse('status', {
          message: `Query classified as ${classification.type}${classification.topic ? ` (${classification.topic})` : ''}. Searching across ${documents.length} contract${documents.length !== 1 ? 's' : ''}...`,
        });
      }

      // Evidence Sufficiency Gate for Streaming
      if (!sufficiency.sufficient) {
        sendSse('status', {
          message: 'Evidence sufficiency check: Insufficient evidence in contract to answer this question.',
        });

        const notFoundAnswer =
          sufficiency.notSpecifiedMessage || 'The contract does not specify the requested information.';
        sendSse('delta', { text: notFoundAnswer });

        const assistantMessage = await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: 'assistant',
            content: notFoundAnswer,
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
          answer: notFoundAnswer,
          citations: [],
          retrievedChunksCount: rankedChunks.length,
        });

        return res.end();
      }

      sendSse('status', {
        message: `Evidence sufficiency verified. Re-ranked ${rankedChunks.length} relevant sections. Generating synthesis...`,
      });

      const abortController = new AbortController();
      let isAborted = false;
      req.on('close', () => {
        isAborted = true;
        abortController.abort();
      });

      const aiResult = await aiService.streamAnswer(
        query,
        rankedChunks,
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

      sendSse('status', { message: 'Verifying quotes against respective contracts...' });
      const verifiedCitationsData: VerifiedCitationRecord[] = [];

      for (const candidateQuote of aiResult.candidateQuotes) {
        if (!candidateQuote || !candidateQuote.trim()) continue;
        if (!citationService.isSubstantiveQuote(candidateQuote)) continue;
        // Stage 1: Does quote exist in document?
        const citData = verifyCandidateQuoteAcrossDocuments(candidateQuote);
        if (citData && citData.verified) {
          // Stage 2: Does quote sufficiently support answer?
          const supportCheck = citationService.doesQuoteSupportAnswer(candidateQuote, aiResult.answer, query);
          if (supportCheck.supports) {
            if (!verifiedCitationsData.some((c) => c.quote === citData.quote && c.documentId === citData.documentId)) {
              verifiedCitationsData.push(citData);
            }
          }
        }
      }

      // Filter out any citation whose quote is subsumed by another citation from the same document
      const finalStreamingCitations = verifiedCitationsData.filter((c) => {
        return !verifiedCitationsData.some(
          (other) => other !== c && other.documentId === c.documentId && other.quote.includes(c.quote)
        );
      });

      // Stage 3: Answer/evidence coverage check
      const coverageResult = citationService.evaluateAnswerCoverage(aiResult.answer, finalStreamingCitations, query);
      if (!coverageResult.hasCoverage) {
        console.warn('[chat.controller] Streaming answer coverage warning:', coverageResult.unsupportedClaims);
      }
      const finalAnswer = coverageResult.filteredAnswer || aiResult.answer;

      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: finalAnswer,
          citations: {
            create: finalStreamingCitations.map((c) => ({
              documentId: c.documentId,
              quote: c.quote,
              verified: c.verified,
              isVerified: c.isVerified,
              startOffset: c.startOffset,
              endOffset: c.endOffset,
              startIndex: c.startIndex,
              endIndex: c.endIndex,
              pageStart: c.pageStart,
              pageEnd: c.pageEnd,
              pageNumber: c.pageNumber,
              chunkId: c.chunkId,
              confidence: c.confidence,
            })),
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
        answer: finalAnswer,
        citations: assistantMessage.citations,
        retrievedChunksCount: rankedChunks.length,
      });

      return res.end();
    }

    // ==========================================
    // NON-STREAMING (STANDARD JSON)
    // ==========================================
    if (!sufficiency.sufficient) {
      const notFoundAnswer =
        sufficiency.notSpecifiedMessage || 'The contract does not specify the requested information.';
      const assistantMessage = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: notFoundAnswer,
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
        answer: notFoundAnswer,
        citations: [],
        retrievedChunksCount: rankedChunks.length,
      });
    }

    const aiResult = await aiService.generateAnswer(query, rankedChunks);

    const verifiedCitationsData: VerifiedCitationRecord[] = [];

    for (const candQuote of aiResult.quotes) {
      if (!candQuote.text || candQuote.text.trim().length === 0) continue;
      if (!citationService.isSubstantiveQuote(candQuote.text)) continue;
      // Stage 1: Does quote exist in document?
      const citData = verifyCandidateQuoteAcrossDocuments(candQuote.text);
      if (citData && citData.verified) {
        // Stage 2: Does quote sufficiently support answer?
        const supportCheck = citationService.doesQuoteSupportAnswer(
          candQuote.text,
          aiResult.answer,
          query,
          candQuote.supports
        );
        if (supportCheck.supports) {
          if (!verifiedCitationsData.some((c) => c.quote === citData.quote && c.documentId === citData.documentId)) {
            verifiedCitationsData.push(citData);
          }
        } else {
          console.warn(`[chat.controller] Rejected quote (insufficient support): "${candQuote.text}" - Reason: ${supportCheck.reason}`);
        }
      }
    }

    // Filter out any citation whose quote is subsumed by another citation from the same document
    const finalNonStreamingCitations = verifiedCitationsData.filter((c) => {
      return !verifiedCitationsData.some(
        (other) => other !== c && other.documentId === c.documentId && other.quote.includes(c.quote)
      );
    });

    // Stage 3: Answer/evidence coverage check
    const coverageResult = citationService.evaluateAnswerCoverage(aiResult.answer, finalNonStreamingCitations, query);
    if (!coverageResult.hasCoverage) {
      console.warn('[chat.controller] Answer coverage warning:', coverageResult.unsupportedClaims);
    }
    const finalAnswer = coverageResult.filteredAnswer || aiResult.answer;

    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: finalAnswer,
        citations: {
          create: finalNonStreamingCitations.map((c) => ({
            documentId: c.documentId,
            quote: c.quote,
            verified: c.verified,
            isVerified: c.isVerified,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
            startIndex: c.startIndex,
            endIndex: c.endIndex,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            pageNumber: c.pageNumber,
            chunkId: c.chunkId,
            confidence: c.confidence,
          })),
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
      answer: finalAnswer,
      citations: assistantMessage.citations,
      retrievedChunksCount: allRetrievedChunks.length,
    });
  } catch (error: any) {
    if (res.headersSent) {
      try {
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || 'Stream processing error' })}\n\n`);
        return res.end();
      } catch {}
    }
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

/**
 * POST /api/chat/agent
 * Part C Option 2: Autonomous Agentic Document Research with tool-calling
 */
export const agentResearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { question, message, documentId, maxRounds } = req.body;
    const query = (question || message || '').trim();

    if (!query) {
      return res.status(400).json({ success: false, error: 'A question or research query is required.' });
    }

    const result = await agentService.research(query, {
      documentId,
      maxRounds: maxRounds ? Number(maxRounds) : undefined,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
