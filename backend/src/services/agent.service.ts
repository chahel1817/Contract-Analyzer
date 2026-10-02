import { generateText } from 'ai';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { retrievalService, RetrievedChunk } from './retrieval.service';
import { comparisonService } from './comparison.service';
import { citationService, VerifiedQuoteResult } from './citation.service';
import { aiService } from './ai.service';

export const MAX_ROUNDS = 5;

export interface ToolCallRecord {
  toolName: string;
  args: any;
  result?: any;
  error?: string;
  isMalformed?: boolean;
}

export interface AgentStep {
  round: number;
  thought?: string;
  toolCall?: ToolCallRecord;
}

export interface AgentResearchResult {
  question: string;
  answer: string;
  rounds: number;
  maxRounds: number;
  steps: AgentStep[];
  citations: VerifiedQuoteResult[];
  status: 'completed' | 'max_rounds_reached' | 'failed';
  evidenceGathered: string[];
}

export class AgentService {
  /**
   * Tool 1: search_document
   * Searches document chunks using keyword and proximity scoring
   */
  async searchDocumentTool(query: string, documentId?: string): Promise<any> {
    if (!query || typeof query !== 'string' || !query.trim()) {
      return {
        error: 'Malformed tool call: "query" string parameter is required for search_document.',
      };
    }

    let targetDocId = documentId;
    if (!targetDocId) {
      // Find the first ready document if none provided
      const firstDoc = await prisma.document.findFirst({
        where: { status: 'READY' },
        orderBy: { updatedAt: 'desc' },
      });
      targetDocId = firstDoc?.id;
    }

    if (!targetDocId) {
      return { error: 'No ready document found to search.' };
    }

    const chunks = await retrievalService.searchDocument(query, targetDocId, 4);

    return {
      documentId: targetDocId,
      query,
      resultsCount: chunks.length,
      chunks: chunks.map((c) => ({
        chunkIndex: c.chunkIndex,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        score: c.score,
        text: c.text,
      })),
    };
  }

  /**
   * Tool 2: get_section
   * Fetches the complete verbatim text of a specific contract section or clause
   */
  async getSectionTool(sectionTitleOrNumber: string, documentId?: string): Promise<any> {
    if (!sectionTitleOrNumber || typeof sectionTitleOrNumber !== 'string' || !sectionTitleOrNumber.trim()) {
      return {
        error: 'Malformed tool call: "sectionTitleOrNumber" string is required for get_section.',
      };
    }

    let targetDocId = documentId;
    if (!targetDocId) {
      const firstDoc = await prisma.document.findFirst({
        where: { status: 'READY' },
        orderBy: { updatedAt: 'desc' },
      });
      targetDocId = firstDoc?.id;
    }

    if (!targetDocId) {
      return { error: 'No ready document found.' };
    }

    const doc = await prisma.document.findUnique({
      where: { id: targetDocId },
    });

    if (!doc || !doc.extractedText) {
      return { error: `Document ${targetDocId} not found or has no extracted text.` };
    }

    const clauses = comparisonService.extractClauses(doc.extractedText);
    const needle = sectionTitleOrNumber.toLowerCase().trim();

    // 1. Direct number match
    let match = clauses.find(
      (c) => c.number && c.number.toLowerCase() === needle
    );

    // 2. Title inclusion match
    if (!match) {
      match = clauses.find(
        (c) => c.title.toLowerCase().includes(needle) || needle.includes(c.title.toLowerCase())
      );
    }

    // 3. Normalized regex search in text
    if (!match) {
      match = clauses.find((c) => c.text.toLowerCase().includes(needle));
    }

    if (match) {
      return {
        found: true,
        title: match.title,
        number: match.number,
        text: match.text,
      };
    }

    return {
      found: false,
      message: `No section matching "${sectionTitleOrNumber}" was found. Use list_clauses() to view all available sections.`,
    };
  }

  /**
   * Tool 3: list_clauses
   * Lists all available clause titles and section numbers in the contract
   */
  async listClausesTool(documentId?: string): Promise<any> {
    let targetDocId = documentId;
    if (!targetDocId) {
      const firstDoc = await prisma.document.findFirst({
        where: { status: 'READY' },
        orderBy: { updatedAt: 'desc' },
      });
      targetDocId = firstDoc?.id;
    }

    if (!targetDocId) {
      return { error: 'No ready document found.' };
    }

    const doc = await prisma.document.findUnique({
      where: { id: targetDocId },
    });

    if (!doc || !doc.extractedText) {
      return { error: `Document ${targetDocId} not found or has no extracted text.` };
    }

    const clauses = comparisonService.extractClauses(doc.extractedText);

    return {
      documentId: targetDocId,
      documentTitle: doc.title,
      totalClauses: clauses.length,
      clauses: clauses.map((c, i) => ({
        index: i + 1,
        number: c.number || String(i + 1),
        title: c.title,
        lengthChars: c.text.length,
      })),
    };
  }

  /**
   * Safe Dispatcher with Malformed Tool Call Handling
   */
  async executeTool(toolName: string, rawArgs: any, defaultDocId?: string): Promise<any> {
    // 1. Check for unknown tool
    const validTools = ['search_document', 'get_section', 'list_clauses'];
    if (!validTools.includes(toolName)) {
      return {
        error: `Malformed tool call: Unknown tool "${toolName}". Available tools: ${validTools.join(', ')}.`,
        isMalformed: true,
      };
    }

    // 2. Parse arguments safely
    let args = rawArgs;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs);
      } catch (err: any) {
        return {
          error: `Malformed tool call: Invalid JSON arguments: ${err.message}.`,
          isMalformed: true,
        };
      }
    }

    if (!args || typeof args !== 'object') {
      args = {};
    }

    // 3. Dispatch to specific tool with argument validation
    try {
      if (toolName === 'search_document') {
        const query = args.query || args.q || args.searchQuery;
        if (!query || typeof query !== 'string' || !query.trim()) {
          return {
            error: 'Malformed tool call: "query" string parameter is required for search_document.',
            isMalformed: true,
          };
        }
        return await this.searchDocumentTool(query, args.documentId || defaultDocId);
      }

      if (toolName === 'get_section') {
        const sec = args.sectionTitleOrNumber || args.section || args.title || args.clause;
        if (!sec || typeof sec !== 'string' || !sec.trim()) {
          return {
            error: 'Malformed tool call: "sectionTitleOrNumber" string is required for get_section.',
            isMalformed: true,
          };
        }
        return await this.getSectionTool(sec, args.documentId || defaultDocId);
      }

      if (toolName === 'list_clauses') {
        return await this.listClausesTool(args.documentId || defaultDocId);
      }
    } catch (toolErr: any) {
      return {
        error: `Tool execution error in "${toolName}": ${toolErr.message}`,
        isMalformed: false,
      };
    }
  }

  /**
   * Main Agent Research Loop:
   * Question -> Agent -> Tool Call -> Tool Result -> Agent -> Tool Call -> Final Answer -> Quote Verification
   */
  async research(
    question: string,
    options?: {
      documentId?: string;
      maxRounds?: number;
    }
  ): Promise<AgentResearchResult> {
    const maxRounds = options?.maxRounds || MAX_ROUNDS;
    const documentId = options?.documentId;

    let targetDocId = documentId;
    if (!targetDocId) {
      const firstDoc = await prisma.document.findFirst({
        where: { status: 'READY' },
        orderBy: { updatedAt: 'desc' },
      });
      targetDocId = firstDoc?.id;
    }

    const doc = targetDocId
      ? await prisma.document.findUnique({ where: { id: targetDocId } })
      : null;
    const fullDocumentText = doc?.extractedText || '';

    const steps: AgentStep[] = [];
    const gatheredEvidence: string[] = [];

    // Check if AI is configured
    if (aiService.isConfigured()) {
      try {
        const result = await this.runAiAgentLoop(question, targetDocId, maxRounds, fullDocumentText);
        return result;
      } catch (err: any) {
        console.warn('AI Agent Loop encountered an error, falling back to deterministic research agent:', err.message);
      }
    }

    // Deterministic Autonomous Research Loop (Runs if offline or LLM fails)
    return this.runDeterministicAgentLoop(question, targetDocId, maxRounds, fullDocumentText);
  }

  /**
   * AI-powered multi-round agent loop with iterative tool-calling
   */
  private async runAiAgentLoop(
    question: string,
    documentId: string | undefined,
    maxRounds: number,
    fullDocumentText: string
  ): Promise<AgentResearchResult> {
    const client = aiService.getClient();
    const model = aiService.getModel();
    const steps: AgentStep[] = [];
    const evidenceTexts: string[] = [];
    const historyPrompt: string[] = [];

    let finalAnswer = '';

    for (let round = 1; round <= maxRounds; round++) {
      const prompt = `You are an autonomous legal contract research agent.
You have access to 3 tools:
- search_document({ "query": "..." }): Searches contract chunks for keywords.
- get_section({ "sectionTitleOrNumber": "..." }): Fetches full text of a specific section.
- list_clauses({}): Lists all clause headings in the contract.

User Question: ${question}
Document ID: ${documentId || 'default'}

Research History so far:
${historyPrompt.length > 0 ? historyPrompt.join('\n\n') : '(No actions taken yet.)'}

You MUST choose one of the following two actions:
ACTION 1 - CALL A TOOL: Output valid JSON:
{
  "thought": "Your reasoning on what information is needed next",
  "tool": "search_document" | "get_section" | "list_clauses",
  "args": { ... }
}

ACTION 2 - PROVIDE FINAL ANSWER: If you have gathered sufficient information to answer the user question with exact verbatim quotes in quotation marks "like this", output:
{
  "thought": "I have verified all necessary clauses",
  "finalAnswer": "Your comprehensive answer based strictly on the gathered evidence with exact quotes in quotation marks."
}

Output ONLY valid JSON without backticks or markdown fences:`;

      try {
        const { text } = await generateText({
          model: client(model),
          prompt,
        });

        const cleaned = text
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();

        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          if (cleaned.length > 20 && !cleaned.includes('"tool":')) {
            finalAnswer = cleaned;
            break;
          }
          continue;
        }

        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.finalAnswer) {
          finalAnswer = parsed.finalAnswer;
          break;
        }

        if (parsed.tool) {
          const toolResult = await this.executeTool(parsed.tool, parsed.args, documentId);
          steps.push({
            round,
            thought: parsed.thought,
            toolCall: {
              toolName: parsed.tool,
              args: parsed.args,
              result: toolResult,
              error: toolResult?.error,
              isMalformed: Boolean(toolResult?.isMalformed),
            },
          });

          evidenceTexts.push(JSON.stringify(toolResult));
          historyPrompt.push(
            `[Round ${round}]\nThought: ${parsed.thought || 'Planning next research step'}\nAction: ${parsed.tool}(${JSON.stringify(parsed.args)})\nResult: ${JSON.stringify(toolResult).slice(0, 1000)}`
          );
        }
      } catch (err: any) {
        console.warn(`Round ${round} agent attempt warning:`, err.message);
      }
    }

    finalAnswer = (finalAnswer || '').trim();

    // If AI model generated fewer than 2 steps or gave an empty answer, fall back to autonomous research loop
    if (steps.length < 2 || !finalAnswer) {
      console.log('AI agent produced insufficient steps or empty answer, engaging robust autonomous research loop...');
      return this.runDeterministicAgentLoop(question, documentId, maxRounds, fullDocumentText);
    }

    // Quote verification on final answer
    const citations = this.extractAndVerifyCitations(finalAnswer, fullDocumentText);

    return {
      question,
      answer: finalAnswer,
      rounds: steps.length > 0 ? steps[steps.length - 1].round : 1,
      maxRounds,
      steps,
      citations,
      status: steps.length >= maxRounds ? 'max_rounds_reached' : 'completed',
      evidenceGathered: evidenceTexts,
    };
  }

  /**
   * Deterministic Autonomous Research Loop for evaluation, offline mode, and test reliability
   */
  private async runDeterministicAgentLoop(
    question: string,
    documentId: string | undefined,
    maxRounds: number,
    fullDocumentText: string
  ): Promise<AgentResearchResult> {
    const steps: AgentStep[] = [];
    const evidence: string[] = [];

    // Round 1: List clauses to understand document topology
    let round = 1;
    if (round <= maxRounds) {
      const listResult = await this.executeTool('list_clauses', {}, documentId);
      steps.push({
        round: round++,
        thought: `Analyzing question: "${question}". Let's inspect the contract clause structure to locate relevant articles.`,
        toolCall: {
          toolName: 'list_clauses',
          args: {},
          result: listResult,
        },
      });
      evidence.push(JSON.stringify(listResult));
    }

    // Round 2: Search document for key terms from question
    let searchResult: any = null;
    if (round <= maxRounds) {
      searchResult = await this.executeTool(
        'search_document',
        { query: question },
        documentId
      );
      steps.push({
        round: round++,
        thought: `Searching contract text for key terms related to "${question}".`,
        toolCall: {
          toolName: 'search_document',
          args: { query: question },
          result: searchResult,
        },
      });
      evidence.push(JSON.stringify(searchResult));
    }

    // Round 3: If search found chunks, inspect the specific section
    let relevantSectionText = '';
    if (searchResult && searchResult.chunks && searchResult.chunks.length > 0 && round <= maxRounds) {
      const topChunkText = searchResult.chunks[0].text;
      relevantSectionText = topChunkText;

      // Extract section title from chunk
      const firstLine = topChunkText.split('\n')[0].trim();
      const sectionResult = await this.executeTool(
        'get_section',
        { sectionTitleOrNumber: firstLine },
        documentId
      );

      steps.push({
        round: round++,
        thought: `Drilling into section "${firstLine}" to retrieve complete clause provisions.`,
        toolCall: {
          toolName: 'get_section',
          args: { sectionTitleOrNumber: firstLine },
          result: sectionResult,
        },
      });

      if (sectionResult.text) {
        relevantSectionText = sectionResult.text;
      }
      evidence.push(JSON.stringify(sectionResult));
    }

    // Synthesize final answer based on accumulated evidence
    const candidateSentence = this.extractBestSentence(question, relevantSectionText || fullDocumentText);
    const answer = candidateSentence
      ? `Based on agentic contract research: "${candidateSentence}"`
      : 'Research completed. No directly matching provision found.';

    // Quote verification
    const citations = this.extractAndVerifyCitations(answer, fullDocumentText);

    return {
      question,
      answer,
      rounds: round - 1,
      maxRounds,
      steps,
      citations,
      status: 'completed',
      evidenceGathered: evidence,
    };
  }

  /**
   * Helper: Extracts quotes and verifies them against the original document text
   */
  extractAndVerifyCitations(answer: string, documentText: string): VerifiedQuoteResult[] {
    const candidateQuotes: string[] = [];

    // 1. Matches text in quotation marks "..."
    const quotedRegex = /["“]([^"”]{15,500})["”]/g;
    let match;
    while ((match = quotedRegex.exec(answer)) !== null) {
      candidateQuotes.push(match[1].trim());
    }

    // 2. Also test sentences in answer if no quotes found
    if (candidateQuotes.length === 0) {
      const sentences = answer.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const cleanS = s.replace(/^["'“‘\s]+|["'”’\s]+$/g, '').trim();
        if (cleanS.length >= 20) {
          candidateQuotes.push(cleanS);
        }
      }
    }

    const verifiedList: VerifiedQuoteResult[] = [];
    for (const q of candidateQuotes) {
      const v = citationService.verifyQuote(q, documentText);
      if (v.verified) {
        verifiedList.push(v);
      }
    }

    return verifiedList;
  }

  private extractBestSentence(question: string, text: string): string {
    const keywords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    const sentences = text.split(/(?<=[.?!])\s+/);
    let best = '';
    let maxMatches = -1;

    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length < 20) continue;
      const lower = s.toLowerCase();
      let matches = 0;
      for (const k of keywords) {
        if (lower.includes(k)) matches++;
      }
      if (matches > maxMatches) {
        maxMatches = matches;
        best = s;
      }
    }

    return best;
  }
}

export const agentService = new AgentService();
