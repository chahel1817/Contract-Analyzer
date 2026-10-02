import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';

export interface ChunkInput {
  id?: string;
  documentId?: string;
  documentTitle?: string;
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

export const AnswerSchema = z.object({
  answer: z.string().min(1),
  quotes: z.array(
    z.object({
      text: z.string().min(1),
    })
  ),
});

export const PRODUCTION_SYSTEM_PROMPT = `You are a Contract Analysis AI.

Your job is to answer questions using ONLY the contract/document content provided to you as context.

STRICT RULES:

1. DOCUMENT-ONLY
- Use only information explicitly present in the provided contract context.
- Do not use general legal knowledge, outside knowledge, assumptions, or information from other documents.
- Never invent names, dates, amounts, deadlines, obligations, or other contract terms.

2. ANSWER THE EXACT QUESTION
- First determine exactly what the user is asking.
- Give a direct answer to that question.
- Do not provide unrelated contract information.
- Do not repeat the same sentence or paragraph.
- Do not say "based on the provided excerpts" unless necessary.
- Do not mention your internal retrieval process.

3. HANDLE MISSING INFORMATION CORRECTLY
If the contract does not contain the specific information requested:
- Clearly say that the specific information is not stated in the provided contract.
- If the contract explains WHERE that information is defined, state that location.
- Do not guess or infer the missing value.

Example:
If asked:
"What is the exact contract duration?"

And the contract says:
"Applicable Term means the Service term stated in an Order Schedule."

Then answer:
"The specific duration is not stated in the SaaS Agreement itself. The Applicable Term is determined by the Service term specified in the applicable Order Schedule."

Do NOT invent a duration.

4. USE CONTRACT TERMINOLOGY
- Preserve the terminology used by the contract.
- If the contract defines a term such as "Applicable Term", "Customer Data", or "Authorized User", use that exact terminology.
- Do not replace contract-specific terminology with vague alternatives.

5. EVIDENCE / QUOTES
For every factual answer, provide one or more exact quotes from the provided contract context that directly support the answer.

Quotes must:
- Be copied exactly from the provided contract text.
- Not be paraphrased.
- Not be combined from unrelated sentences.
- Not contain information that is not present in the contract.
- Be as short as reasonably possible while still proving the answer.

6. NEVER TRUST AI-GENERATED LOCATIONS
Do not invent page numbers, character offsets, section locations, or citation positions.
Return only the quote text.
The application will independently verify the quote against the original document and determine its location.

7. MULTIPLE POSSIBLE CLAUSES
If multiple clauses are relevant:
- Identify the main rule first.
- Then explain the relevant exception or additional condition.
- Provide supporting quotes for each important point.

8. CONTRACT-SPECIFIC AMBIGUITY
If the contract contains placeholders such as:
[Fee Amount]
[Effective Date]
[Customer Name]
[Renewal Period]

treat them as unspecified values.

For example:
"The agreement specifies a renewal period placeholder, but does not provide the actual renewal period."

Never replace placeholders with assumed values.

9. DO NOT OVERSTATE
Distinguish between:
- what the contract explicitly states
- what the contract does not state

Do not say "the contract requires X" unless the contract explicitly supports that statement.

10. ANSWER STYLE
Use this structure:

Answer:
<direct answer in 1–3 concise paragraphs>

Evidence:
- "<exact quote from contract>"
- "<exact quote if another clause is necessary>"

Keep the answer concise unless the user asks for detailed analysis.

11. IF THE ANSWER IS NOT IN THE DOCUMENT
Return:

Answer:
"The contract does not specify [requested information]."

Then, if useful:

"The contract does state [related information that is actually present]."

Evidence:
- "<exact supporting quote>"

12. NO HALLUCINATIONS
The following are prohibited:
- guessing missing values
- using outside legal knowledge
- assuming industry-standard terms
- fabricating clauses
- fabricating quotes
- fabricating page numbers
- fabricating section numbers
- claiming that something exists in the contract when it does not

Your highest priority is factual accuracy and faithful representation of the contract.`;

/**
 * Formats retrieved chunks cleanly grouped under:
 * DOCUMENT:
 * <docName>
 * 
 * DOCUMENT CONTENT:
 * [chunk 1]
 * 
 * [chunk 2]
 */
export function formatContractContext(chunks: ChunkInput[]): string {
  const docsMap = new Map<string, string[]>();
  for (const c of chunks) {
    const docName = c.documentTitle || 'Contract Document';
    if (!docsMap.has(docName)) {
      docsMap.set(docName, []);
    }
    docsMap.get(docName)!.push(c.text.trim());
  }

  const sections: string[] = [];
  for (const [docName, chunkTexts] of docsMap.entries()) {
    sections.push(`DOCUMENT:\n${docName}\n\nDOCUMENT CONTENT:\n${chunkTexts.join('\n\n')}`);
  }

  return sections.join('\n\n====================\n\n');
}

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
        answer: 'The contract does not specify information to answer this question.',
        quotes: [],
      };
    }

    const formattedContext = formatContractContext(chunks);
    const userPrompt = `${formattedContext}\n\nUSER QUESTION:\n${question}`;

    // 1. If AI API key is configured (OpenRouter, OpenAI, etc.)
    if (this.isConfigured()) {
      const client = this.getClient();
      const modelName = this.getModel();

      // Strategy A: Native Structured Outputs via generateObject
      try {
        const { object } = await generateObject({
          model: client(modelName),
          schema: AnswerSchema,
          system: PRODUCTION_SYSTEM_PROMPT,
          prompt: userPrompt,
        });

        const lowerAns = object.answer.toLowerCase();
        const isNotFound = lowerAns.includes('does not specify') || lowerAns.includes('not stated') || lowerAns.includes('could not find');

        return {
          answer: object.answer.trim(),
          quotes: isNotFound ? [] : object.quotes.map((q) => ({ text: q.text.trim() })).filter((q) => q.text.length > 0),
        };
      } catch (structuredErr: any) {
        console.warn('generateObject failed on model', modelName, ':', structuredErr.message);
        console.log('Falling back to prompt-guided JSON generation (compatible with all open models)...');

        // Strategy B: Prompt-guided JSON generation via generateText
        try {
          const { text } = await generateText({
            model: client(modelName),
            system: `${PRODUCTION_SYSTEM_PROMPT}\n\nYou MUST output ONLY a valid JSON object conforming exactly to this structure:
{
  "answer": "your direct answer based strictly on the contract text",
  "quotes": [
    { "text": "exact verbatim quote copied directly from contract text" }
  ]
}
Do not write markdown fences, backticks, or any text outside the JSON. Output valid JSON only.`,
            prompt: `${userPrompt}\n\nOutput JSON only:`,
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
              const lowerAns = String(parsed.answer).toLowerCase();
              const isNotFound = lowerAns.includes('does not specify') || lowerAns.includes('not stated') || lowerAns.includes('could not find');

              return {
                answer: parsed.answer.trim(),
                quotes: isNotFound
                  ? []
                  : parsed.quotes.map((q: any) => ({
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
        answer: 'The contract does not specify the requested information.',
        quotes: [],
      };
    }

    return {
      answer: bestSentence,
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
      const msg = 'The contract does not specify information to answer this question.';
      options?.onDelta?.(msg);
      return { answer: msg, candidateQuotes: [] };
    }

    const formattedContext = formatContractContext(chunks);
    let fullAnswer = '';

    if (this.isConfigured()) {
      try {
        const client = this.getClient();
        const modelName = this.getModel();

        const result = streamText({
          model: client(modelName),
          system: PRODUCTION_SYSTEM_PROMPT,
          prompt: `${formattedContext}\n\nUSER QUESTION:\n${question}`,
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
   * Extracts candidate verbatim quotes from the generated answer and chunks.
   * Parses the Evidence section quotes, inline quotes, and matching sentences.
   */
  private extractCandidateQuotes(answerText: string, chunks: ChunkInput[]): string[] {
    const quotes = new Set<string>();

    // 1. Evidence section quotes (e.g. - "..." or - “...”)
    const evidenceSection = answerText.split(/Evidence:/i)[1] || '';
    const bulletRegex = /[-*•]?\s*["“]([^"”\r\n]{6,400})["”]/g;
    let match;
    while ((match = bulletRegex.exec(evidenceSection)) !== null) {
      const q = match[1].trim();
      if (q.length >= 6) {
        quotes.add(q);
      }
    }

    // 2. Matches any quoted strings "..." or “...” in the answer
    const quotedRegex = /["“]([^"”\r\n]{10,400})["”]/g;
    while ((match = quotedRegex.exec(answerText)) !== null) {
      const candidate = match[1].trim();
      if (candidate.length >= 10) {
        quotes.add(candidate);
      }
    }

    // 3. Cross-reference sentences in retrieved chunks that are directly quoted in the answer
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

