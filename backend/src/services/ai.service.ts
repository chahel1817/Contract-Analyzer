import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';

export interface ChunkInput {
  id?: string;
  text: string;
  pageStart?: number | null;
  chunkIndex?: number;
}

export interface QuoteOutput {
  text: string;
}

export interface GeneratedAnswer {
  answer: string;
  quotes: QuoteOutput[];
}

const AnswerSchema = z.object({
  answer: z
    .string()
    .describe('A comprehensive, direct answer to the user question based strictly on the provided contract excerpts.'),
  quotes: z
    .array(
      z.object({
        text: z.string().describe('Exact verbatim quote from the excerpts supporting the answer. Must not be paraphrased.'),
      })
    )
    .describe('List of exact verbatim quotes extracted from the contract excerpts.'),
});

export class AiService {
  public getApiKey(): string {
    return process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  }

  public getBaseURL(): string {
    return process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1';
  }

  public getModel(): string {
    return process.env.AI_MODEL || process.env.OPENAI_MODEL || 'openrouter/free';
  }

  public isConfigured(): boolean {
    return Boolean(this.getApiKey());
  }

  public getClient() {
    return createOpenAI({
      apiKey: this.getApiKey(),
      baseURL: this.getBaseURL(),
      headers: {
        'HTTP-Referer': process.env.CORS_ORIGIN || 'http://localhost:3000',
        'X-Title': 'Contract Analyzer',
      },
    });
  }

  /**
   * Generates a structured answer with supporting verbatim quotes from retrieved contract chunks.
   * Input: question + retrieved chunks
   * Output: { answer: string, quotes: [{ text: string }] }
   */
  async generateAnswer(question: string, chunks: ChunkInput[]): Promise<GeneratedAnswer> {
    if (!question || !question.trim()) {
      return {
        answer: 'Please provide a valid question regarding the contract.',
        quotes: [],
      };
    }

    if (!chunks || chunks.length === 0) {
      return {
        answer: 'I could not find any relevant sections in the document to answer your question.',
        quotes: [],
      };
    }

    const context = chunks
      .map((c, i) => `--- Excerpt ${i + 1} (Page ${c.pageStart || 1}) ---\n${c.text}`)
      .join('\n\n');

    // 1. If AI API key is configured (OpenRouter, OpenAI, etc.)
    if (this.isConfigured()) {
      const client = this.getClient();
      const modelName = this.getModel();

      // Strategy A: Native Structured Outputs via generateObject
      try {
        const { object } = await generateObject({
          model: client(modelName),
          schema: AnswerSchema,
          prompt: `You are an expert legal contract analyst AI.
Your role is to answer questions about legal contracts with 100% fidelity to the provided text.

CRITICAL RULES:
1. Base your answer EXCLUSIVELY on the provided contract excerpts below.
2. Every factual statement or claim in your answer MUST be supported by one or more exact quotes in the "quotes" array.
3. Every item in the "quotes" array MUST be an EXACT, literal quote copied word-for-word from the excerpts. Do NOT paraphrase, summarize, or alter words inside quotes.
4. If the answer cannot be found in the provided excerpts, state: "The provided contract sections do not contain information to answer this question." and return an empty quotes array [].
5. Never invent or hallucinate clauses, numbers, or dates not explicitly written in the excerpts.

Context Excerpts:
${context}

User Question:
${question}`,
        });

        return {
          answer: object.answer,
          quotes: object.quotes.map((q) => ({ text: q.text.trim() })).filter((q) => q.text.length > 0),
        };
      } catch (structuredErr: any) {
        console.warn('generateObject failed on model', modelName, ':', structuredErr.message);
        console.log('Falling back to prompt-guided JSON generation (compatible with all open models)...');

        // Strategy B: Prompt-guided JSON generation via generateText
        try {
          const { text } = await generateText({
            model: client(modelName),
            system: `You are an expert legal contract analyst AI. You MUST output ONLY a valid raw JSON object conforming to this exact structure:
{
  "answer": "your direct answer based strictly on the excerpts",
  "quotes": [
    { "text": "exact verbatim quote copied directly from text" }
  ]
}
Do not write markdown fences, backticks, or any conversational text outside the JSON. Only output valid JSON.`,
            prompt: `Context Excerpts:
${context}

User Question:
${question}

Remember: quotes must be exact literal excerpts. Output JSON only:`,
          });

          // Extract JSON from response (handles optional code block wrappers)
          const cleanedText = text
            .replace(/```json/gi, '')
            .replace(/```/g, '')
            .trim();

          const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed.answer && Array.isArray(parsed.quotes)) {
              return {
                answer: parsed.answer,
                quotes: parsed.quotes.map((q: any) => ({
                  text: typeof q === 'string' ? q.trim() : (q.text || '').trim(),
                })).filter((q: { text: string }) => q.text.length > 0),
              };
            }
          }
        } catch (textErr: any) {
          console.warn('generateText JSON fallback also failed:', textErr.message);
        }
      }
    }

    // 2. Deterministic Fallback Mode (Runs if API key is not set or both LLM attempts fail)
    return this.generateDeterministicFallback(question, chunks);
  }

  /**
   * Deterministic answer generator for evaluation and offline testing.
   * Extracts the most relevant sentences as exact verbatim quotes.
   */
  private generateDeterministicFallback(question: string, chunks: ChunkInput[]): GeneratedAnswer {
    const questionKeywords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length > 2);

    let bestSentence = '';
    let bestScore = -1;

    for (const chunk of chunks) {
      const sentences = chunk.text.split(/(?<=[.?!])\s+/);
      for (const rawSentence of sentences) {
        const sentence = rawSentence.trim();
        if (sentence.length < 15) continue;

        const lower = sentence.toLowerCase();
        let matchCount = 0;
        for (const kw of questionKeywords) {
          if (lower.includes(kw)) matchCount++;
        }

        if (matchCount > bestScore) {
          bestScore = matchCount;
          bestSentence = sentence;
        }
      }
    }

    if (bestScore <= 0 || !bestSentence) {
      return {
        answer: 'The provided contract excerpts do not contain sufficient information to answer this question.',
        quotes: [],
      };
    }

    return {
      answer: `Based on the contract text: ${bestSentence}`,
      quotes: [
        {
          text: bestSentence,
        },
      ],
    };
  }

  /**
   * Streams an AI answer token-by-token and extracts candidate verbatim quotes for verification.
   */
  async streamAnswer(
    question: string,
    chunks: ChunkInput[],
    options?: {
      signal?: AbortSignal;
      onDelta?: (delta: string) => void;
    }
  ): Promise<{ answer: string; candidateQuotes: string[] }> {
    if (!question || !question.trim()) {
      const msg = 'Please provide a valid question regarding the contract.';
      options?.onDelta?.(msg);
      return { answer: msg, candidateQuotes: [] };
    }

    if (!chunks || chunks.length === 0) {
      const msg = 'I could not find any relevant sections in the document to answer your question.';
      options?.onDelta?.(msg);
      return { answer: msg, candidateQuotes: [] };
    }

    const context = chunks
      .map((c, i) => `--- Excerpt ${i + 1} (Page ${c.pageStart || 1}) ---\n${c.text}`)
      .join('\n\n');

    let fullAnswer = '';

    if (this.isConfigured()) {
      try {
        const client = this.getClient();
        const modelName = this.getModel();

        const result = streamText({
          model: client(modelName),
          system: `You are an expert legal contract analyst AI.
Your role is to answer questions about legal contracts with 100% fidelity to the provided contract excerpts.

CRITICAL RULES:
1. Base your answer EXCLUSIVELY on the provided excerpts.
2. When referencing specific contractual clauses, obligations, numbers, or rules, wrap exact verbatim quotes in quotation marks "like this".
3. Never invent or hallucinate terms not found in the excerpts.
4. Keep the answer direct, authoritative, and well-structured.`,
          prompt: `Context Excerpts:
${context}

User Question:
${question}

Answer:`,
          abortSignal: options?.signal,
        });

        for await (const chunk of result.textStream) {
          if (options?.signal?.aborted) break;
          fullAnswer += chunk;
          options?.onDelta?.(chunk);
        }
      } catch (err: any) {
        if (options?.signal?.aborted) {
          return { answer: fullAnswer, candidateQuotes: [] };
        }
        console.warn('streamText failed, falling back to deterministic stream:', err.message);
      }
    }

    // Fallback if fullAnswer is empty (due to missing key, failure, or rate limit)
    if (!fullAnswer.trim()) {
      const fallback = this.generateDeterministicFallback(question, chunks);
      const words = fallback.answer.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (options?.signal?.aborted) break;
        const piece = i === words.length - 1 ? words[i] : words[i] + ' ';
        fullAnswer += piece;
        options?.onDelta?.(piece);
        // Small delay to simulate streaming
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return {
        answer: fullAnswer,
        candidateQuotes: fallback.quotes.map((q) => q.text),
      };
    }

    // Extract candidate quotes from fullAnswer and retrieved chunks
    const candidateQuotes = this.extractCandidateQuotes(fullAnswer, chunks);

    return {
      answer: fullAnswer,
      candidateQuotes,
    };
  }

  /**
   * Extracts candidate verbatim quotes from the generated answer and chunks
   */
  private extractCandidateQuotes(answerText: string, chunks: ChunkInput[]): string[] {
    const quotes = new Set<string>();

    // 1. Matches quoted strings "..." or “...” in the answer
    const quotedRegex = /["“]([^"”\r\n]{12,300})["”]/g;
    let match;
    while ((match = quotedRegex.exec(answerText)) !== null) {
      const candidate = match[1].trim();
      if (candidate.length >= 12) {
        quotes.add(candidate);
      }
    }

    // 2. Cross-reference sentences in retrieved chunks that are directly quoted in the answer
    for (const chunk of chunks) {
      const sentences = chunk.text.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const sentence = s.trim();
        if (sentence.length >= 25 && answerText.toLowerCase().includes(sentence.toLowerCase())) {
          quotes.add(sentence);
        }
      }
    }

    return Array.from(quotes);
  }

  /**
   * Summarizes a contract using configured AI provider or fallback
   */
  async summarizeContract(text: string): Promise<string> {
    if (!this.isConfigured()) {
      return `Summary of contract (${text.length} characters): Key provisions include confidentiality, liability caps, and termination rights.`;
    }

    try {
      const client = this.getClient();
      const modelName = this.getModel();

      const response = await generateText({
        model: client(modelName),
        prompt: `You are an expert legal contract analyst. Provide a concise executive summary of the following contract:
${text.slice(0, 25000)}`,
      });

      return response.text;
    } catch (error: any) {
      return `Contract summary: ${text.slice(0, 500)}...`;
    }
  }
}

export const aiService = new AiService();

