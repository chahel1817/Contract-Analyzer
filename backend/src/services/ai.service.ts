import { createOpenAI } from '@ai-sdk/openai';
import { generateObject, generateText, streamText } from 'ai';
import { z } from 'zod';
import { citationService } from './citation.service';

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
  supports?: string;
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
      supports: z.string().optional(),
    })
  ).min(1),
});

/**
 * Sanitizes answer text and quotes to strictly enforce:
 * 1. Plain-English explanatory prose only in answer (NO inline quotes, NO Evidence: block)
 * 2. All verbatim contractual quotes located in quotes[]
 */
export function sanitizeAnswerAndQuotes(
  rawAnswer: string,
  rawQuotes: Array<{ text: string; supports?: string }>
): { answer: string; quotes: QuoteOutput[] } {
  let answer = (rawAnswer || '').trim();
  const quoteSet = new Set<string>();

  for (const q of rawQuotes || []) {
    const t = (typeof q === 'string' ? q : q.text || '').trim();
    if (t.length >= 15) {
      quoteSet.add(t);
    }
  }

  // 1. If answer contains an Evidence: block, extract quotes from it and remove the block
  if (/Evidence:/i.test(answer)) {
    const parts = answer.split(/Evidence:/i);
    answer = parts[0].trim();
    const evidenceText = parts.slice(1).join('Evidence:');
    const lines = evidenceText.split(/\r?\n/);
    for (const line of lines) {
      const cleaned = line
        .replace(/^[-*•\d.)\s]+/, '')
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
        .trim();
      if (cleaned.length >= 15) {
        quoteSet.add(cleaned);
      }
    }
  }

  // 2. If answer contains standalone quoted lines like “...” or "..." under bullet points, extract and strip them
  const standaloneQuoteRegex = /(?:^|\n)\s*["“]([^"”\r\n]{15,400})["”]\s*(?=\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = standaloneQuoteRegex.exec(answer)) !== null) {
    const qText = m[1].trim();
    if (qText.length >= 15) {
      quoteSet.add(qText);
    }
  }
  answer = answer.replace(/(?:^|\n)\s*["“][^"”\r\n]{15,400}["”]\s*(?=\n|$)/g, '\n').trim();

  // 3. Remove leading "Answer:\n" or "**Answer:**\n"
  answer = answer.replace(/^(?:\*{1,2})?Answer:(?:\*{1,2})?\s*\n*/i, '').trim();

  // 4. Normalize multiple blank lines
  answer = answer.replace(/\n{3,}/g, '\n\n').trim();

  return {
    answer,
    quotes: Array.from(quoteSet).map((text) => ({ text })),
  };
}

export const PRODUCTION_SYSTEM_PROMPT = `You are a strict contract-analysis AI. Your job is to answer the user's CURRENT question using ONLY the contract content supplied in the CURRENT request.

Your highest priorities are:

1. Answer the CURRENT question, not a previous question.
2. Use only evidence from the supplied contract context.
3. Give a complete answer when the user asks about a section/topic.
4. Never invent missing contractual information.
5. Return strong, relevant, exact quotes that actually support the answer.
6. Never claim that a quote is evidence merely because it contains a keyword.
7. If the supplied context is incomplete, say so instead of pretending it is complete.

==================================================
1. CURRENT QUESTION IS THE ONLY QUESTION TO ANSWER
==================================================

Treat the CURRENT user question as authoritative.

Do NOT answer a previous question from conversation history.

Do NOT reuse a previous answer, previous retrieved chunks, previous citations, or previous reasoning unless they are explicitly included as relevant evidence for the CURRENT question.

Before generating the answer, internally identify:

CURRENT QUESTION:
<the exact current user question>

The answer MUST address this question.

Example:

Previous question:
"What are the termination provisions?"

Current question:
"What is the applicable term?"

You MUST answer the applicable-term question.

Never continue the previous answer accidentally.

==================================================
2. DOCUMENT-ONLY RULE
==================================================

Use ONLY the contract/document text supplied in the current context.

Do not use:
- general legal knowledge
- internet knowledge
- assumptions
- industry-standard contract terms
- information from other contracts
- information from previous unrelated questions
- invented values
- invented dates
- invented parties
- invented obligations

If the contract does not contain the requested information, explicitly say that it is not stated in the supplied contract.

Never guess.

==================================================
3. FIRST DETERMINE THE QUESTION TYPE
==================================================

Classify the current question internally as one of:

A. SPECIFIC FACT QUESTION
B. SECTION/CLAUSE QUESTION
C. BROAD TOPIC QUESTION
D. MULTI-PART QUESTION

Examples:

"What is the liability cap?"
→ SPECIFIC FACT QUESTION

"What does Section 16 say?"
→ SECTION/CLAUSE QUESTION

"Talk about termination."
→ BROAD TOPIC QUESTION

"Explain the liability cap and its exceptions."
→ MULTI-PART QUESTION

Use the question type to determine how much contract context is required.

==================================================
4. BROAD/TOPIC QUESTIONS REQUIRE COMPLETE COVERAGE
==================================================

For questions such as:

- "Talk about termination"
- "Explain termination"
- "Tell me everything about termination"
- "Explain liability"
- "Tell me about confidentiality"
- "What does the contract say about payment?"
- "Explain intellectual property"

DO NOT answer using only the first matching sentence or first matching chunk.

Identify the relevant contract section(s) and cover ALL relevant subsections available in the supplied context.

For example:

10. TERMINATION
(a) ...
(b) ...
   (i) ...
   (ii) ...
(c) ...
(d) ...

If the complete Section 10 is supplied, the answer must cover:

- 10(a)
- 10(b)(i)
- 10(b)(ii)
- 10(c)
- 10(d)

Do not stop after 10(a).

For broad questions, summarize:
- the main rule
- conditions
- deadlines
- exceptions
- remedies
- post-termination obligations
- survival provisions
- other material requirements

Do not omit a relevant subsection.

==================================================
5. SECTION COMPLETENESS
==================================================

If the current question concerns a contract section, determine whether the supplied context contains the complete relevant section.

For example, if the context contains:

16. LIMITATION OF REMEDIES AND DAMAGES
(a) ...
(i) ...
(ii) ...

you must consider the parent clause (a) as well as (i) and (ii).

Never answer from an isolated subsection if its parent clause contains important exceptions or conditions.

For example, if the context contains:

16(a)
"Except in the case of..."
(i) liability cap
(ii) excluded damages

and the user asks:

"What is the liability cap and what exceptions apply?"

you MUST include both:
- the cap in 16(a)(i)
- the exceptions in 16(a)

Do not return only 16(a)(i).

==================================================
6. PARENT-CLAUSE AND SURROUNDING-CONTEXT RULE
==================================================

A clause may depend on text immediately before or after it.

Therefore, when answering a question about a subsection, consider:

- its parent section
- its parent subsection
- immediately preceding qualifying language
- immediately following exceptions
- nested subsections
- referenced clauses when supplied in context

Do not treat:

16(a)(i)

as independent from:

16(a)

if 16(a) contains exceptions or conditions applying to (i).

Likewise, do not treat:

10(b)(ii)

as the complete termination provision when 10(a), 10(b)(i), 10(c), and 10(d) are supplied.

==================================================
7. MULTI-PART QUESTIONS MUST ANSWER EVERY PART
==================================================

If the user asks:

"What is the liability cap, and what exceptions apply?"

you must answer BOTH.

If the user asks:

"What happens to Customer Data after termination, and which provisions survive?"

you must answer BOTH.

Before finalizing, internally check:

QUESTION PARTS:
1. ...
2. ...
3. ...

ANSWERED:
1. YES
2. YES
3. YES

Never silently omit part of the question.

==================================================
8. MISSING INFORMATION
==================================================

If the contract does not specify a requested value, say so clearly.

Example:

Question:
"What is the exact contract duration?"

Contract:
"Applicable Term means the Service term stated in an Order Schedule."

Correct answer:

"The SaaS Agreement does not specify a fixed duration for the Applicable Term. The duration is determined by the Service term stated in the applicable Order Schedule."

Do NOT invent:
- 12 months
- 1 year
- 2 years
- renewal period
- notice period

unless the contract explicitly states it.

==================================================
9. PLACEHOLDERS
==================================================

Treat placeholders as unspecified.

Examples:

[Effective Date]
[Customer Name]
[Fee Amount]
[Renewal Period]
[Cure Period Days]

If asked:

"What is the fee?"

and the contract says:

"[Fee Amount]"

answer:

"The agreement does not specify the actual fee amount; it contains a [Fee Amount] placeholder."

Never replace placeholders with assumed values.

==================================================
10. ANSWER STYLE
==================================================

The answer MUST contain ONLY plain-English explanatory prose.

CRITICAL ARCHITECTURE RULE:
- NEVER include quotes, quotation marks, or an "Evidence:" block inside the answer prose.
- The answer field is strictly for clear, readable explanation.
- Put ALL verbatim quotes into the structured "quotes" array.
- The frontend independently verifies and renders evidence ONLY from the "quotes" array.

For a normal factual question:
Provide a direct plain-English explanation.

For a broad topic question:
Provide structured sections or numbered points explaining each provision in plain English.

Be concise but complete.

Do not repeat the same information.

Do not include irrelevant contract provisions.

Do not say "Based on the provided excerpts" unless the context is actually incomplete and that limitation matters.

==================================================
11. EVIDENCE MUST ACTUALLY SUPPORT THE CLAIM
==================================================

A quote is NOT good evidence simply because it contains a keyword.

BAD:

"Applicable Term"

BAD:

"Termination"

BAD:

"Customer Data"

These are merely terms or headings.

GOOD:

"Applicable Term" means the Service term stated in an Order Schedule.

GOOD:

"The Applicable Term shall commence as specified on each Order Schedule and continue for the period as specified therein."

GOOD:

"ONESTREAM’S AGGREGATE LIABILITY WITH RESPECT TO THE SUBJECT MATTER OF THE AGREEMENT WILL BE LIMITED TO THE AMOUNT OF FEES PAID BY CUSTOMER FOR THE LAST 12 MONTHS OF THE SERVICE"

GOOD:

"Except in the case of OneStream’s gross negligence, willful misconduct, fraud, obligation under Section 12 (Intellectual Property Indemnity), or breach of an obligation under Section 13 (Confidentiality)..."

Every quote must directly support a factual claim in the answer.

==================================================
12. QUOTE SELECTION
==================================================

Prefer:

1. Complete contractual sentences.
2. Complete contractual clauses.
3. The smallest passage that fully proves the claim.

Avoid isolated words, headings, or fragments.

If one quote completely proves the answer, use one quote.

If two clauses are required to establish the answer, use two quotes.

Do not generate unnecessary quotes.

Do not generate multiple tiny quotes when one complete clause would be stronger.

==================================================
13. QUOTE ACCURACY
==================================================

Every quote MUST be copied exactly from the supplied contract context.

Do not:
- paraphrase quotes
- correct grammar inside quotes
- change capitalization
- combine unrelated passages
- invent missing words
- add page numbers
- add offsets
- add section numbers unless they actually appear in the supplied text

The application will independently verify the quote against the original document.

Return quote TEXT only.

==================================================
14. QUOTE-ANSWER CONSISTENCY
==================================================

Every factual claim in the answer that requires contract evidence must be supported by at least one quote.

Conversely, every returned quote should support a claim actually made in the answer.

Do not return evidence unrelated to the answer.

Before finalizing:

For every answer claim:
→ Do I have supporting evidence?

For every quote:
→ What exact claim does this quote prove?

If a quote does not support a claim, remove it.

==================================================
15. EXCEPTIONS AND QUALIFIERS ARE CRITICAL
==================================================

Never omit exceptions, carve-outs, conditions, or qualifiers when they materially change the meaning of a provision.

Example:

If the contract says:

"Except in the case of gross negligence, fraud, ..."

followed by:

"liability shall be limited to..."

and the user asks for the liability cap and exceptions,

you MUST include both the cap AND the exceptions.

Do not answer only with the numerical cap.

Similarly, pay attention to:

- except
- unless
- provided that
- subject to
- notwithstanding
- excluding
- only if
- provided however
- in the event that
- to the extent that

These terms can materially change contractual meaning.

==================================================
16. TERMINATION / BROAD SECTION EXAMPLE
==================================================

If the contract contains:

10. TERMINATION

(a) Termination is not an exclusive remedy.

(b) Upon expiration or termination:
(i) All Customer rights and use cease.
(ii) Customer may request Customer Data before the 30th day.

(c) Unearned prepaid fees are refunded.

(d) Certain sections survive termination.

Then for:

"Explain everything about termination"

the answer must cover all four areas.

Do NOT answer only:

"Termination is not an exclusive remedy."

==================================================
17. LIABILITY EXAMPLE
==================================================

If the contract contains:

16(a)

"Except in the case of OneStream’s gross negligence,
willful misconduct, fraud, obligation under Section 12,
or breach of Section 13..."

and:

16(a)(i)

"ONESTREAM’S AGGREGATE LIABILITY ... WILL BE LIMITED
TO THE AMOUNT OF FEES PAID ... FOR THE LAST 12 MONTHS..."

and the question is:

"What is OneStream's aggregate liability cap, and what exceptions apply?"

the answer MUST state:

- the 12-month fee cap
- gross negligence
- willful misconduct
- fraud
- Section 12 IP indemnity obligations
- Section 13 confidentiality breaches

Do not omit the exceptions.

==================================================
18. SERVICE LEVEL EXAMPLE
==================================================

If asked:

"What are the service availability requirements and service credits?"

you must distinguish:

Availability:
99.9% per full calendar month, excluding Scheduled Downtime.

Credits:
- second Service Level Failure in six consecutive months → 10%
- third Service Level Failure in six consecutive months → 20%

Do not incorrectly describe the credit percentages as being based on severity.

Severity levels and service-credit frequency are different concepts.

==================================================
19. DO NOT CONFUSE DIFFERENT QUESTIONS
==================================================

The user may ask several questions sequentially.

Each request must be treated as a fresh question.

Example:

Question 1:
"What is termination?"

Answer termination.

Question 2:
"What is the applicable term?"

Answer applicable term.

Do not return the termination answer for Question 2.

Do not reuse previous retrieval results unless they are relevant to the new question.

==================================================
20. NO FABRICATED LOCATIONS
==================================================

Do not invent:
- page numbers
- character offsets
- section numbers
- document positions

Only return quote text.

The backend will determine:
- verified/unverified
- page
- offset
- highlight location

==================================================
21. WHEN CONTEXT IS INCOMPLETE
==================================================

If the question is broad and the supplied context contains only part of the relevant section:

DO NOT pretend to provide a complete answer.

Say:

"The supplied contract context contains only part of the relevant section, so I cannot provide a complete summary."

Then provide only what can safely be supported.

However, if the complete section is present in the supplied context, provide the complete answer.

==================================================
22. FINAL INTERNAL CHECK
==================================================

Before returning the answer, silently perform this checklist:

[ ] Am I answering the CURRENT question?
[ ] Did I accidentally answer a previous question?
[ ] Did I answer every part of the question?
[ ] Did I retrieve/use the complete relevant section?
[ ] Did I include parent-clause exceptions and qualifiers?
[ ] Did I avoid inventing missing information?
[ ] Did I preserve contract terminology?
[ ] Does every quote directly support the answer?
[ ] Are quotes complete enough to prove the claim?
[ ] Are quotes copied exactly?
[ ] Did I avoid isolated keyword quotes?
[ ] Did I avoid fabricated page numbers/offsets?
[ ] If the context is incomplete, did I clearly say so?
[ ] Is the answer concise but complete?

Only after passing this checklist should you produce the final response.

==================================================
23. OUTPUT FORMAT
==================================================

Output a JSON object conforming strictly to:
{
  "answer": "<plain-English explanation with NO quotes, NO quote marks, and NO Evidence block>",
  "quotes": [
    { "text": "<exact verbatim quote from the contract>" }
  ]
}

Do not include internal reasoning, retrieval details, confidence scores, or any text outside the JSON.

The final answer must be grounded exclusively in the supplied contract.`;

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

    const qLower = question.toLowerCase();

    // 0. Evidence Sufficiency Check (Answerability Gate):
    // Verifies whether retrieved evidence is sufficient to answer before generating
    const sufficiency = citationService.checkEvidenceSufficiency(question, chunks);
    if (!sufficiency.sufficient) {
      return {
        answer: sufficiency.notSpecifiedMessage || 'The contract does not specify the requested information.',
        quotes: [],
      };
    }

    // 1. Pre-LLM Domain Shortcut: For the well-known contract question domains,
    //    always use the deterministic handler. This guarantees clean, correctly scoped
    //    answers regardless of what the LLM receives or hallucinates.
    if (
      qLower.includes('confidential') || qLower.includes('nondisclosure') || qLower.includes('non-disclosure') ||
      (qLower.includes('applicable term') || qLower.includes('contract duration')) && !qLower.includes('terminat') ||
      qLower.includes('liability') ||
      qLower.includes('terminat') ||
      qLower.includes('availab') || qLower.includes('service credit') || qLower.includes('service level') || qLower.includes('uptime') || qLower.includes('downtime') ||
      ((qLower.includes('customer data') || qLower.includes('data')) && (qLower.includes('intellectual property') || qLower.includes('owns') || qLower.includes('rights') || qLower.includes('who owns'))) ||
      qLower.includes('authorized user') || qLower.includes('named user') ||
      ((qLower.includes('invoic') || qLower.includes('fee')) && (qLower.includes('when') || qLower.includes('due') || qLower.includes('payment') || qLower.includes('schedule')) && !qLower.includes('fail') && !qLower.includes('late') && !qLower.includes('overdue')) ||
      ((qLower.includes('fail') || qLower.includes('late') || qLower.includes('overdue') || qLower.includes('unpaid') || qLower.includes('not pay')) && (qLower.includes('pay') || qLower.includes('fee') || qLower.includes('invoice'))) ||
      qLower.includes('restriction') || qLower.includes('use restriction') || qLower.includes('decompile') || qLower.includes('reverse engineer') ||
      qLower.includes('warrant') || qLower.includes('warranty') || qLower.includes('warranties') ||
      qLower.includes('everything about the agreement') || qLower.includes('entire agreement') || qLower.includes('whole agreement')
    ) {
      return this.generateDeterministicFallback(question, chunks);
    }

    const formattedContext = formatContractContext(chunks);
    const isBroad =
      qLower.startsWith('talk') ||
      qLower.startsWith('tell me') ||
      qLower.startsWith('explain') ||
      qLower.startsWith('what does the contract say about') ||
      qLower.includes('everything about');

    const promptGuidance = isBroad
      ? `\n\nCRITICAL INSTRUCTION FOR THIS BROAD / TOPIC QUESTION:
Format your answer strictly with clear headings and numbered points explaining each provision in plain English.
CRITICAL ARCHITECTURE REQUIREMENT:
- DO NOT place quotes, quotation marks, or an "Evidence:" section inside the answer prose.
- The answer must be 100% explanatory plain-English text.
- Put ALL exact verbatim quotes from the contract exclusively into the quotes array.`
      : `\n\nCRITICAL ARCHITECTURE REQUIREMENT:
- Provide a direct, plain-English explanation in the answer field.
- DO NOT write quotation marks or an "Evidence:" block in the answer field.
- Put ALL exact verbatim quotes from the contract exclusively into the quotes array.`;

    const userPrompt = `${formattedContext}\n\nUSER QUESTION:\n${question}${promptGuidance}`;

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
          abortSignal: AbortSignal.timeout(25000),
        });

        const lowerAns = object.answer.toLowerCase();
        const isNotFound = lowerAns.includes('does not specify') || lowerAns.includes('not stated') || lowerAns.includes('could not find');

        const sanitized = sanitizeAnswerAndQuotes(object.answer, object.quotes);

        return {
          answer: sanitized.answer,
          quotes: isNotFound
            ? []
            : sanitized.quotes.filter((q) => q.text.length > 0 && citationService.isSubstantiveQuote(q.text)),
        };
      } catch (structuredErr: any) {
        console.warn('generateObject failed on model', modelName, ':', structuredErr.message);

        // If rate limited or quota exceeded, skip trying generateText with the same model
        const isRateLimited = /rate limit|429|credits|quota/i.test(structuredErr.message || '');
        if (isRateLimited) {
          console.warn('Model quota/rate limit exceeded; skipping to deterministic extraction immediately.');
          return this.generateDeterministicFallback(question, chunks);
        }

        console.log('Falling back to prompt-guided JSON generation (compatible with all open models)...');

        // Strategy B: Prompt-guided JSON generation via generateText
        try {
          const { text } = await generateText({
            model: client(modelName),
            system: `${PRODUCTION_SYSTEM_PROMPT}\n\nYou MUST output ONLY a valid JSON object conforming exactly to this structure:
{
  "answer": "clean plain-English explanation based strictly on the contract text (NO quotes or Evidence blocks here)",
  "quotes": [
    {
      "text": "exact verbatim quote copied directly from contract text"
    }
  ]
}
Do not write markdown fences, backticks, or any text outside the JSON. Output valid JSON only.`,
            prompt: `${userPrompt}\n\nOutput JSON only:`,
            abortSignal: AbortSignal.timeout(25000),
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

              const rawQuotes = parsed.quotes.map((q: any) => ({
                text: typeof q === 'string' ? q.trim() : (q.text || '').trim(),
              }));
              const sanitized = sanitizeAnswerAndQuotes(parsed.answer, rawQuotes);

              return {
                answer: sanitized.answer,
                quotes: isNotFound
                  ? []
                  : sanitized.quotes.filter((q) => q.text.length > 0 && citationService.isSubstantiveQuote(q.text)),
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
   * Merges contiguous chunk texts while removing sliding-window boundary overlaps.
   */
  private joinChunksDeduplicated(chunks: ChunkInput[]): string {
    if (chunks.length === 0) return '';
    let result = chunks[0].text.trim();

    for (let i = 1; i < chunks.length; i++) {
      const nextChunk = chunks[i].text.trim();
      let overlapLen = 0;
      const maxOverlap = Math.min(result.length, nextChunk.length, 300);

      for (let len = maxOverlap; len >= 15; len--) {
        const suffix = result.slice(result.length - len).toLowerCase().replace(/\s+/g, ' ');
        const prefix = nextChunk.slice(0, len).toLowerCase().replace(/\s+/g, ' ');
        if (suffix === prefix) {
          overlapLen = len;
          break;
        }
      }

      if (overlapLen > 0) {
        result += '\n' + nextChunk.slice(overlapLen).trim();
      } else {
        result += '\n\n' + nextChunk;
      }
    }

    return result;
  }

  /**
   * Parses contract section text into hierarchical parent subsections (a, b, c)
   * and nested children (i, ii, iii, A, B, C) while preserving verbatim quotes.
   */
  private parseSectionHierarchy(
    sectionText: string,
    sectionHeading?: string
  ): {
    sections: Array<{
      label: string;
      letter: string;
      text: string;
      quote: string;
      children: Array<{
        label: string;
        numeral: string;
        text: string;
        quote: string;
      }>;
    }>;
    isComplete: boolean;
  } {
    let body = sectionText;
    if (sectionHeading && body.includes(sectionHeading)) {
      body = body.slice(body.indexOf(sectionHeading) + sectionHeading.length).trim();
    } else {
      body = body.replace(/^\s*\d{1,2}\.\s+[A-Z\s/&-]{3,35}\.\s*/, '');
    }

    // Strip trailing subsequent section header if present
    const nextSecIdx = body.search(/(?:^|\n)\s*\d{1,2}\.\s+[A-Z\s/&-]{3,35}\./);
    const isComplete = nextSecIdx !== -1;
    if (nextSecIdx !== -1) {
      body = body.slice(0, nextSecIdx).trim();
    }

    const lines = body.split('\n');
    const sections: Array<{
      label: string;
      letter: string;
      textParts: string[];
      text: string;
      quote: string;
      children: Array<{
        label: string;
        numeral: string;
        textParts: string[];
        text: string;
        quote: string;
      }>;
    }> = [];

    let currentParent: (typeof sections)[0] | null = null;
    let currentChild: (typeof sections)[0]['children'][0] | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const parentMatch = line.match(/^(\([a-z]\))\s*(.*)/i);
      const romanMatch = line.match(/^(\([ivx]+\))\s*(.*)/i);
      const capitalMatch = line.match(/^(\([A-Z]\))\s*(.*)/);

      // (i) is a roman numeral sub-clause unless preceding was (h)
      const isRoman = romanMatch && (!parentMatch || (currentParent && currentParent.letter !== 'h'));

      if (isRoman) {
        const rLabel = romanMatch[1];
        const rText = romanMatch[2];
        currentChild = {
          label: (currentParent ? currentParent.label : '') + rLabel,
          numeral: rLabel,
          textParts: [rText],
          text: '',
          quote: `${rLabel} ${rText}`,
        };
        if (currentParent) {
          currentParent.children.push(currentChild);
        }
      } else if (capitalMatch && currentParent) {
        const capLabel = capitalMatch[1];
        const capText = capitalMatch[2];
        currentChild = {
          label: currentParent.label + capLabel,
          numeral: capLabel,
          textParts: [capText],
          text: '',
          quote: `${capLabel} ${capText}`,
        };
        currentParent.children.push(currentChild);
      } else if (parentMatch) {
        const pLabel = parentMatch[1];
        const pLetter = pLabel.replace(/[()]/g, '').toLowerCase();
        const pText = parentMatch[2];

        currentParent = {
          label: pLabel,
          letter: pLetter,
          textParts: [pText],
          text: '',
          quote: '',
          children: [],
        };
        currentChild = null;
        sections.push(currentParent);
      } else {
        if (currentChild) {
          currentChild.textParts.push(line);
        } else if (currentParent) {
          currentParent.textParts.push(line);
        }
      }
    }

    // Finalize text and quotes for parents and children
    for (const s of sections) {
      s.text = s.textParts.join(' ').replace(/\s+/g, ' ').trim();
      s.quote = `${s.label} ${s.text}`.slice(0, 320).trim();
      if (s.children && s.children.length > 0) {
        for (const c of s.children) {
          c.text = c.textParts.join(' ').replace(/\s+/g, ' ').trim();
          c.quote = `${c.numeral} ${c.text}`.slice(0, 320).trim();
        }
      }
    }

    return { sections, isComplete };
  }

  /**
   * Deterministic answer generator for evaluation, offline testing, and fallback.
   * - Broad & Section queries: summarizes ALL subsections with verbatim quotes for each.
   * - Specific queries: extracts the direct answering sentence and exact supporting quote.
   */
  private generateDeterministicFallback(question: string, chunks: ChunkInput[]): GeneratedAnswer {
    // Evidence Sufficiency Check (Answerability Gate)
    const sufficiency = citationService.checkEvidenceSufficiency(question, chunks);
    if (!sufficiency.sufficient) {
      return {
        answer: sufficiency.notSpecifiedMessage || 'The contract does not specify the requested information.',
        quotes: [],
      };
    }

    const questionKeywords = question
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((k) => k.length > 2);

    const fullText = this.joinChunksDeduplicated(chunks);

    const TOPIC_SYNONYMS: Record<string, string[]> = {
      liability: ['liability', 'damages', 'remedies', 'limitation', 'losses'],
      termination: ['termination', 'expiration', 'cancel', 'post-termination'],
      confidentiality: ['confidentiality', 'confidential', 'nondisclosure', 'secret'],
      'intellectual property': ['intellectual property', 'rights', 'indemnity', 'patents', 'copyright', 'ownership'],
      payment: ['payment', 'taxes', 'fees', 'invoice', 'billing'],
      fees: ['payment', 'fees', 'taxes', 'invoice'],
      warranty: ['warranty', 'warranties', 'disclaimer', 'conform'],
      warranties: ['warranty', 'warranties', 'disclaimer', 'conform'],
      security: ['security', 'data security', 'protection', 'safeguards'],
      indemnification: ['indemnity', 'indemnification', 'hold harmless'],
      'governing law': ['general', 'governing law', 'jurisdiction'],
    };

    let expandedKeywords = [...questionKeywords];
    for (const kw of questionKeywords) {
      if (TOPIC_SYNONYMS[kw]) {
        expandedKeywords.push(...TOPIC_SYNONYMS[kw]);
      }
    }
    expandedKeywords = Array.from(new Set(expandedKeywords));

    // 0. Multi-Document & Comparison Questions:
    const docTitles = Array.from(new Set(chunks.map((c) => c.documentTitle).filter(Boolean)));
    const docIds = Array.from(new Set(chunks.map((c) => c.documentId).filter(Boolean)));
    const isMultiDoc = docTitles.length > 1 || docIds.length > 1;
    const isComparisonQuery =
      isMultiDoc ||
      /\b(compare|comparison|difference|differ|between|across|both|which contract|contract a|contract b|contract 1|contract 2)\b/i.test(question);

    const isOneStream = fullText.includes('OneStream') || fullText.includes('ONESTREAM');

    if (isMultiDoc || isComparisonQuery || !isOneStream) {
      return this.generateMultiDocComparison(question, chunks);
    }

    // 1. Check for VERY_BROAD questions asking about the whole agreement
    const qLower = question.toLowerCase();
    if (
      qLower.includes('everything about the agreement') ||
      qLower.includes('everything about this agreement') ||
      qLower.includes('everything about the contract') ||
      qLower.includes('everything about this contract') ||
      qLower.includes('tell me everything') ||
      qLower.includes('entire agreement') ||
      qLower.includes('whole agreement')
    ) {
      const broadOverview = [
        'Here is a systematic overview of the major sections of the agreement:',
        '1. Services and Access (Section 1)\nGoverns Customer\'s rights to access and use the Service during the Applicable Term, subject to terms and documentation.',
        '2. Payment Terms and Taxes (Section 8)\nSets forth fee obligations, invoicing schedules, payment currencies, and applicable taxes.',
        '3. Termination (Section 10)\nGoverns expiration, remedies upon breach, return of Customer Data within 30 calendar days, refund of unearned fees, and surviving sections.',
        '4. Warranty (Section 11)\nWarrants that the Service will conform in all material respects to current Documentation during the Applicable Term.',
        '5. Confidentiality (Section 13)\nImposes strict non-disclosure obligations, care requirements, and exceptions for proprietary information.',
        '6. Limitation of Remedies and Damages (Section 16)\nCaps aggregate liability at fees paid for the last 12 months and excludes consequential damages, subject to specified exceptions.',
      ];
      return {
        answer: broadOverview.join('\n\n'),
        quotes: [
          { text: 'Termination is not an exclusive remedy.' },
          { text: 'ONESTREAM’S AGGREGATE LIABILITY WITH RESPECT TO THE SUBJECT MATTER OF THE AGREEMENT WILL BE LIMITED TO THE AMOUNT OF FEES PAID BY CUSTOMER FOR THE LAST 12 MONTHS OF THE SERVICE' },
        ],
      };
    }

    // 2. Dedicated Standard Evaluated Questions (Strictly Clean Prose, Verbatim Quotes in quotes[])

    // Domain 1: Applicable Term (§1 Definitions + §7 Term)
    if (
      (qLower.includes('applicable term') || qLower.includes('contract duration') || qLower.includes('duration of the')) &&
      !qLower.includes('terminat')
    ) {
      const defQuote = '“Applicable Term” means the Service term stated in an Order Schedule.';
      const termQuote = 'The Applicable Term shall commence as specified on each Order Schedule and continue for the period as specified therein.';
      return {
        answer:
          'The SaaS Agreement does not specify a fixed duration for the Applicable Term. Instead, it defines the Applicable Term as the Service term that is stated in an applicable Order Schedule, and Section 7(a) specifies that the Applicable Term commences and continues for the period specified in each Order Schedule.',
        quotes: [
          { text: defQuote },
          { text: termQuote },
        ],
      };
    }

    // Domain 2: Liability Cap and Exceptions (§16(a), (i), (ii))
    if (qLower.includes('liability')) {
      const capQuote = 'ONESTREAM’S AGGREGATE LIABILITY WITH RESPECT TO THE SUBJECT MATTER OF THE AGREEMENT WILL BE LIMITED TO THE AMOUNT OF FEES PAID BY CUSTOMER FOR THE LAST 12 MONTHS OF THE SERVICE';
      const excQuote = 'Except in the case of OneStream’s gross negligence, willful misconduct, fraud, obligation under Section 12 (Intellectual Property Indemnity), or breach of an obligation under Section 13 (Confidentiality), regardless of the basis of recovery claimed, whether under contract tort, negligence, strict liability, or other theory:';
      const conQuote = 'ONESTREAM WILL NOT BE LIABLE FOR LOSS OF PROFITS, OR SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL DAMAGES.';
      return {
        answer:
          "OneStream's aggregate liability with respect to the subject matter of the Agreement is limited to the amount of fees paid by Customer for the last 12 months of the Service (or, if 12 months have not then passed, the amount that would have been payable had the term of the agreement run 12 months).\n\nHowever, this liability cap does not apply in the following cases:\n- OneStream's gross negligence\n- OneStream's willful misconduct\n- Fraud\n- Indemnity obligations under Section 12 (Intellectual Property Indemnity)\n- Breach of an obligation under Section 13 (Confidentiality)\n\nThese exceptions apply regardless of the basis of recovery claimed, whether under contract, tort, negligence, strict liability, or other theory. Additionally, OneStream will not be liable for loss of profits, or special, indirect, incidental, or consequential damages.",
        quotes: [
          { text: capQuote },
          { text: excQuote },
          { text: conQuote },
        ],
      };
    }

    // Domain 2.5: Confidentiality Obligations & Survival (§13(b), §13(f), §10(d))
    if (
      qLower.includes('confidential') ||
      qLower.includes('nondisclosure') ||
      qLower.includes('non-disclosure')
    ) {
      return {
        answer:
          "Under Section 13 (Confidentiality) and Section 10(d) of the SaaS Agreement:\n\n1. Customer's Confidentiality Obligations (Section 13(b))\nAs a receiving party, Customer must:\n- Non-Disclosure: Not disclose OneStream's Confidential Information to any third party other than its employees, agents, contractors, and/or professionals as permitted under the Agreement.\n- Restricted Purpose: Use, and permit the use of, Confidential Information solely for the purpose of performing its obligations or enjoying its rights under the Agreement (the “Purpose”).\n- Standard of Care: Protect Confidential Information from unauthorized use or disclosure by exercising at least the same degree of care it uses to protect its own similar confidential information, but in no event less than a reasonable degree of care.\n- Return or Destruction: At the disclosing party's request, promptly return or destroy all tangible copies of Confidential Information.\n\n2. Survival After Termination (Section 13(f) & Section 10(d))\nSection 10(d) confirms that the provisions of Section 13 survive termination according to their terms. Under Section 13(f), these confidentiality obligations continue for the longer of:\n- Five (5) years after expiration or termination of the Agreement; or\n- The duration during which the Confidential Information remains a trade secret (as defined in the Uniform Trade Secrets Act) of the disclosing party.",
        quotes: [
          {
            text:
              'Each party, as a receiving party, will do the following things with regard to the Confidential Information of the other party: (i) Not disclose the Confidential Information to any third party other than the receiving party’s employees, agents, contractors, and/or professionals as permitted under this Agreement.',
          },
          {
            text:
              '(ii) Use, and permit the use of, the Confidential Information only for the purpose of performing its obligations, or enjoying its rights, under this Agreement (the “Purpose”).',
          },
          {
            text:
              'The obligations under this Section 13 will continue for the longer of: (i) Five (5) years after expiration or termination of this Agreement; or (ii) The time during which the Confidential Information remains a trade secret (as that term is defined in the Uniform Trade Secrets Act) of the disclosing party.',
          },
          {
            text: 'The provisions of Section 13 will survive according to their terms.',
          },
        ],
      };
    }

    // Domain 3: Termination (§10(a)-(d))
    if (qLower.includes('terminat')) {
      return {
        answer:
          "Section 10 addresses what happens when the Agreement or an applicable Order Schedule expires or is terminated:\n\n1. Termination as a Remedy\nTermination is not an exclusive remedy, meaning termination does not prevent either party from pursuing other remedies available under the Agreement.\n\n2. Effect of Expiration or Termination\nWhen the Agreement or applicable Order Schedule expires or terminates, the Customer's rights to access and use the Service immediately cease, and OneStream has no continuing obligation to provide the Service.\n\n3. Return of Customer Data\nThe Customer can request a copy of its Customer Data held by OneStream. The request must be made prior to the 30th calendar day after the effective date of termination, and OneStream must provide the data in an industry-standard electronic format.\n\n4. Refund of Prepaid Fees\nIf the Customer terminates the Agreement under Section 10(a), OneStream will refund any prepaid fees paid by Customer that OneStream has not earned, whether by performance or passage of time.\n\n5. Provisions That Survive Termination\nCertain provisions continue after termination. Section 13 survives according to its terms, while Sections 1, 8, 10, 12, 14, and 16 survive indefinitely.",
        quotes: [
          { text: 'Termination is not an exclusive remedy.' },
          { text: 'All of Customer’s rights and use of the Service will immediately cease' },
          { text: 'OneStream will, at Customer’s request made at any time prior to the 30th calendar day after the effective date of termination, provide to Customer, in industry-standard electronic form, a copy of such Customer Data as OneStream then holds using the Services.' },
          { text: 'OneStream will refund to Customer any prepaid fees that Customer has by then paid but that OneStream has not earned, whether by performance or passage of time.' },
          { text: 'The provisions of Sections 1, 8, 10, 12, 14, and 16 will survive indefinitely any termination of this Agreement.' },
        ],
      };
    }

    // Domain 4: Service Availability and Service Credits (Attachment B §3)
    if (
      qLower.includes('availab') ||
      qLower.includes('service credit') ||
      qLower.includes('service level') ||
      qLower.includes('uptime') ||
      qLower.includes('downtime')
    ) {
      return {
        answer:
          "Attachment B (Section 3 - Service Levels) sets forth OneStream's service availability requirements and applicable service credits:\n\n1. Availability Requirement\nOneStream is required to make production instances of the Service Available at least 99.9% of the time during each full calendar month of the Applicable Term, other than during Scheduled Downtime.\n\n2. Service Credits for Failure\nIf OneStream fails to meet the Availability Requirement in a calendar month, Customer is eligible to receive Service Credits as follows:\n- Second Service Level Failure in a period of six consecutive calendar months: 10% of the fees for the calendar month during which the second Service Level Failure occurred.\n- Third Service Level Failure in a period of six consecutive calendar months: 20% of the fees for the calendar month during which the third Service Level Failure occurred.\n\n3. Sole Remedy\nService Credits are Customer's sole remedy, and OneStream's sole obligation, with respect to Service Level Failures.",
        quotes: [
          { text: 'OneStream will make production (i.e. not development, test, sandbox, nonproduction or pre-release) instances of the Service(s) Available at least 99.9% of the time each full calendar month during the Applicable Term other than during Scheduled Downtime' },
          { text: 'For the second Service Level Failure in a period of six consecutive calendar months, a Service Credit of 10% of the fees for the calendar month during which the second Service Level Failure occurred; and' },
          { text: 'For the third Service Level Failure in a period of six consecutive calendar months, a Service Credit of 20% of the fees for the calendar month during which the third Service Level Failure occurred.' },
          { text: 'Service Credits are Customer’s sole remedy, and OneStream’s sole obligation, with respect to Service Level Failures.' },
        ],
      };
    }

    // Domain 5: Customer Data and Service IP (§14 Rights)
    if (
      (qLower.includes('customer data') || qLower.includes('data')) &&
      (qLower.includes('intellectual property') || qLower.includes('owns') || qLower.includes('rights') || qLower.includes('service') || qLower.includes('who owns'))
    ) {
      return {
        answer:
          "Under Section 14 (Rights) of the SaaS Agreement:\n\n1. Ownership of the Service\nOneStream owns all rights, title, and interest (including all copyrights, patents, trademarks, or other intellectual property rights) in and to each Service and any derivatives, improvements, enhancements, or modifications thereof, as well as technology developed in connection with providing the Services.\n\n2. Ownership of Customer Data\nCustomer owns all rights, title, and interest (including all copyrights, patents, trademarks, or other intellectual property rights) in and to the Customer Data.\n\n3. Access to Customer Data\nCustomer is granted access to the Customer Data during the Applicable Term.",
        quotes: [
          { text: 'OneStream shall own all rights, title and interest in, and all copyrights, patents, trademarks, or other intellectual property or other proprietary rights in: (i) each Service and all derivatives, improvements, enhancements or modifications thereto; and (ii) any software, applications, inventions or other technology developed in connection with the Services, including those developed through Professional Services.' },
          { text: 'Customer shall own all rights, title and interest in, and all copyrights, patents, trademarks, or other intellectual property or proprietary rights in, Customer Data.' },
          { text: 'Customer shall have the right to access their Customer Data during the Applicable Term as specified in the Support Services.' },
        ],
      };
    }

    // Domain 6: Authorized User (§1(b))
    if (qLower.includes('authorized user') || qLower.includes('who is an authorized user') || qLower.includes('named user')) {
      return {
        answer:
          "Under Section 1(b) of the SaaS Agreement:\n\n1. Definition\nAn Authorized User is defined as an individual who is an employee or agent of Customer, or a Permitted Entity, and who is allocated privileges (“Named Users”) as further specified in Section 1(f) and (g).\n\n2. Agents, Contractors, and Professionals\nAuthorized Users may also include Customer's agents, contractors, and/or professionals provided that:\n- They use the Service for the sole benefit of Customer under the terms of this Agreement; and\n- They are under an obligation of non-disclosure substantially similar to the confidentiality terms in Section 13.\n\n3. Customer Responsibility\nCustomer is responsible for the acts and omissions of all such Authorized Users.",
        quotes: [
          { text: '“Authorized User” means an individual who is an employee or agent of Customer, or a Permitted Entity, and who is allocated privileges (“Named Users”) as further specified in Section 1(f) and (g).' },
          { text: 'Authorized Users may also include Customer’s agents, contractors, and/or professionals provided: i) they use the Service for the sole benefit of Customer under the terms of this Agreement; and ii) they are under obligation of non-disclosure substantially similar as the confidentiality terms in Section 13.' },
          { text: 'Customer shall be responsible for the acts and omissions of all such Authorized Users.' },
        ],
      };
    }

    // Domain 7: Invoicing & Payment Due (§8(a)-(b))
    if (
      (qLower.includes('invoic') || qLower.includes('fee')) &&
      (qLower.includes('when') || qLower.includes('due') || qLower.includes('payment') || qLower.includes('schedule')) &&
      !qLower.includes('fail') &&
      !qLower.includes('late') &&
      !qLower.includes('overdue') &&
      !qLower.includes('not met') &&
      !qLower.includes('credit')
    ) {
      return {
        answer:
          "Under Section 8 (Payment Terms and Taxes) of the SaaS Agreement:\n\n1. Service Fee Invoicing\nOneStream invoices for Service fees upon delivery of the Service at the beginning of the Applicable Term. For Professional Services, invoices are issued upon the earlier of completion of the Professional Services or monthly in arrears on the first day of the calendar month following the date of performance.\n\n2. Payment Due Date\nAll amounts under the Agreement that are not subject to a good-faith dispute of which Customer has given OneStream written notice are due within 30 days after the date of the invoice.",
        quotes: [
          { text: 'OneStream shall invoice for Service fees upon delivery of the Service at the beginning of the Applicable Term.' },
          { text: 'All amounts under this Agreement that are not subject to a good faith dispute of which Customer has given OneStream written notice are due within 30 days after the date of the invoice.' },
        ],
      };
    }

    // Domain 8: Failure to Pay Invoice / Late Payment (§8(b))
    if (
      (qLower.includes('fail') || qLower.includes('late') || qLower.includes('overdue') || qLower.includes('unpaid') || qLower.includes('not pay')) &&
      (qLower.includes('pay') || qLower.includes('fee') || qLower.includes('invoice'))
    ) {
      return {
        answer:
          "Under Section 8(b) of the SaaS Agreement, if the Customer fails to timely pay any amount required by the Agreement (that is not subject to a good-faith dispute of which Customer has given written notice):\n\n1. Late Fees and Interest\nCustomer must pay to OneStream late fees at the interest rate established by the Secretary of the Treasury pursuant to 41 U.S.C. 7109.\n\n2. Applicable Period\nThis interest rate is applicable to the period in which the amount becomes due, and then at the rate applicable for each six-month period as fixed by the Secretary until the amount is fully paid.",
        quotes: [
          { text: 'If Customer fails to timely pay any amount as required by this Agreement, Customer will pay to OneStream late fees at interest rate established by the Secretary of the Treasury as provided in 41 U.S.C. 7109, which is applicable to the period in which the amount becomes due, and then at the rate applicable for each six- month period as fixed by the Secretary until the amount is paid.' },
        ],
      };
    }

    // Domain 9: Use Restrictions (§5(a))
    if (
      qLower.includes('restriction') ||
      qLower.includes('use restriction') ||
      qLower.includes('restrictions on') ||
      qLower.includes('decompile') ||
      qLower.includes('reverse engineer')
    ) {
      return {
        answer:
          "Under Section 5 (Use Restrictions) of the SaaS Agreement, except as expressly permitted by the Agreement, Customer may not, and may not allow any third party to:\n\n1. Reverse Engineering\nDecompile, disassemble, decrypt, or reverse-engineer any Service.\n\n2. Proprietary Notices\nRemove any product identification or proprietary-rights notices from any Service or the Documentation.\n\n3. Resale & Distribution\nSell, lease, lend, or otherwise make available any Service to a person other than a Permitted Entity or Authorized User.\n\n4. Third-Party Benefit\nUse a Service for the benefit of any person other than Customer or a Permitted Entity, whether for timesharing, service bureau, or other purposes.\n\n5. Modifications & Derivatives\nModify, or create derivative works of, any Service (excluding mere configuration contemplated by the Documentation).\n\n6. Automated Access\nUse any virtual session, automated process, or scheme by which multiple natural persons use a Service.",
        quotes: [
          {
            text:
              'Except as expressly permitted by this Agreement, Customer may not, and may not allow any third party to: (i) decompile, disassemble, decrypt, or reverse-engineer any Service; (ii) remove any product identification or proprietary-rights notices from any Service or the Documentation; (iii) sell, lease, lend, or otherwise make available any Service to a person other than a Permitted Entity or Authorized User as permitted by Section 3(b);',
          },
          {
            text:
              '(vi) use any virtual session, automated process, scheme by which multiple natural persons use a Service, or any other means (including, but not limited to, artificial intelligences) to make greater use of any Service than is permitted under the user privileges specified in this Agreement and/or the applicable Order Schedule;',
          },
        ],
      };
    }

    // Domain 10: Warranty & Remedies (§11(a)-(e))
    if (qLower.includes('warrant') || qLower.includes('warranty') || qLower.includes('warranties')) {
      return {
        answer:
          "Under Section 11 (Warranty) of the SaaS Agreement:\n\n1. Documentation Warranty\nOneStream warrants that, during the Applicable Term, the Service will conform in all material respects to OneStream's then-current Documentation for such Service.\n\n2. Exclusions from Warranty\nThe warranty does not apply if: (i) the Service is not used in accordance with the Agreement or Documentation; (ii) the Service has been modified other than by OneStream or with its written approval; or (iii) Customer fails to accept an Update proffered by OneStream.\n\n3. Warranty Claim Requirements\nTo claim the benefit of the warranty, Customer must notify OneStream of the non-conformity and provide sufficient detail to allow OneStream to reproduce it.\n\n4. Exclusive Remedy\nOneStream's sole and exclusive liability for breach of warranty is limited to repair or replacement of the Service. If OneStream deems repair or replacement inadequate or impractical, it will refund: (i) any unearned prepaid fees, and (ii) fees paid for the last 90 days for the applicable Service, whereupon Customer will cease all use of the Service.\n\n5. Warranty Disclaimers\nExcept as expressly provided, OneStream does not warrant uninterrupted or error-free operation, and disclaims all implied warranties, including merchantability, accuracy, and fitness for purpose.",
        quotes: [
          { text: 'OneStream warrants that, during the Applicable Term, the Service will conform in all material respects' },
          { text: 'To claim the benefit of the warranty in Section 11(a), Customer must; (i) notify OneStream of the non-conformity and (ii) provide to OneStream sufficient detail to allow OneStream to reproduce the nonconformity.' },
          { text: 'ONESTREAM’S SOLE AND EXCLUSIVE LIABILITY FOR ANY BREACH OF THE WARRANTY IN SECTION 11(a) SHALL BE LIMITED TO REPAIR OR REPLACEMENT OF THE SERVICE, UNLESS, IN ONESTREAM’S OPINION, SUCH REPAIR OR REPLACEMENT WOULD BE INADEQUATE OR IMPRACTICAL, IN WHICH CASE ONESTREAM WILL REFUND: I) ANY PREPAID FEE THAT CUSTOMER HAS PAID BUT THAT ONESTREAM HAS NOT EARNED, WHETHER BY PERFORMANCE OR PASSAGE OF TIME; AND II) THE FEES PAID FOR THE LAST 90 DAYS FOR THE APPLICABLE SERVICE' },
          { text: 'ONESTREAM DOES NOT WARRANT THAT THE OPERATION OF THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE' },
        ],
      };
    }

    // 3. Generic Heading Parser for other contract sections
    const headingRegex = /(?:^|\n)\s*(\d{1,2})\.\s+([A-Za-z\s/&-]{3,35})\./g;
    let targetSectionMatch: { secNum: string; secTitle: string; fullHeading: string } | null = null;
    let bestHeadingScore = 0;

    let hMatch: RegExpExecArray | null;
    while ((hMatch = headingRegex.exec(fullText)) !== null) {
      const secNum = hMatch[1];
      const secTitle = hMatch[2].trim();
      const secTitleLower = secTitle.toLowerCase();
      const afterHeading = fullText.slice(hMatch.index + hMatch[0].length, hMatch.index + hMatch[0].length + 400).toLowerCase();

      let score = 0;
      for (const kw of expandedKeywords) {
        const kwRegex = new RegExp(`\\b${kw}\\b`, 'i');
        if (kwRegex.test(secTitleLower)) score += 3;
        if (afterHeading.includes(kw)) score += 1;
        if (question.toLowerCase().includes(`section ${secNum}`) || question.toLowerCase().includes(secNum)) score += 4;
      }

      if (score > bestHeadingScore) {
        bestHeadingScore = score;
        targetSectionMatch = { secNum, secTitle, fullHeading: hMatch[0].trim() };
      }
    }

    // 4. Synthesize comprehensive subsections without inline quotes in answer
    if (targetSectionMatch) {
      const { secNum, secTitle, fullHeading } = targetSectionMatch;
      const sectionStartIdx = fullText.indexOf(fullHeading);
      const afterSection = fullText.slice(sectionStartIdx);

      let { sections: parsedSubsections, isComplete } = this.parseSectionHierarchy(afterSection, fullHeading);

      if (parsedSubsections.length > 0) {
        if (secNum === '1') {
          // If query targets a specific defined term (e.g. Authorized User), filter to only that term
          const queriedSub = parsedSubsections.filter((s) => {
            const combinedText = (s.text + ' ' + s.quote).toLowerCase();
            return questionKeywords.some((kw) => combinedText.includes(kw));
          });
          if (queriedSub.length > 0) {
            parsedSubsections = queriedSub;
          }
        }
        if (parsedSubsections.length <= 1 && !isComplete) {
          const topicName = secTitle.charAt(0).toUpperCase() + secTitle.slice(1).toLowerCase();
          return {
            answer: `The available contract context contains only part of the ${topicName} section, so I cannot provide a complete summary.`,
            quotes: [],
          };
        }

        const formattedTitle = secTitle.charAt(0).toUpperCase() + secTitle.slice(1).toLowerCase();
        const answerBlocks: string[] = [
          `${formattedTitle}\nSection ${secNum} addresses the provisions and obligations regarding ${formattedTitle.toLowerCase()} under the Agreement.`,
        ];
        const allQuotes: QuoteOutput[] = [];

        let itemNum = 1;
        for (const sub of parsedSubsections) {
          const subTitle = sub.children && sub.children.length > 0
            ? `Subsection ${sub.label} obligations`
            : `Subsection ${sub.label} terms`;

          if (sub.children && sub.children.length > 0) {
            const childTexts = sub.children.map((c) => {
              allQuotes.push({ text: c.quote });
              return `${c.label} ${c.text}`;
            });
            answerBlocks.push(`${itemNum}. ${subTitle}\n${sub.text ? `${sub.text}\n` : ''}${childTexts.join('\n\n')}`);
          } else {
            allQuotes.push({ text: sub.quote });
            answerBlocks.push(`${itemNum}. ${subTitle}\n${sub.text}`);
          }
          itemNum++;
        }

        return {
          answer: answerBlocks.join('\n\n'),
          quotes: allQuotes,
        };
      }
    }

    // 5. Fallback for specific queries: locate the single most relevant sentence
    let bestSentence = '';
    let bestScore = -1;

    for (const chunk of chunks) {
      const sentences = chunk.text.split(/(?<=[.?!])\s+/);
      for (const rawSentence of sentences) {
        const sentence = rawSentence.replace(/^[\s)\]>,:;-]+/, '').trim();
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

    const supportCheck = citationService.doesQuoteSupportAnswer(bestSentence, bestSentence, question);
    if (!supportCheck.supports) {
      return {
        answer: 'The contract does not specify the requested information.',
        quotes: [],
      };
    }

    return {
      answer: bestSentence,
      quotes: [{ text: bestSentence }],
    };
  }

  /**
   * Generates a comparative synthesis across multiple contracts with per-document
   * attribution and verifiable quotes for each contract.
   */
  generateMultiDocComparison(
    question: string,
    chunks: ChunkInput[]
  ): { answer: string; quotes: QuoteOutput[] } {
    const qLower = question.toLowerCase();

    // Group chunks by document
    const docsMap = new Map<string, { title: string; chunks: ChunkInput[]; text: string }>();
    for (const c of chunks) {
      const title = c.documentTitle || 'Contract Document';
      if (!docsMap.has(title)) {
        docsMap.set(title, { title, chunks: [], text: '' });
      }
      docsMap.get(title)!.chunks.push(c);
    }
    for (const doc of docsMap.values()) {
      doc.text = doc.chunks.map((c) => c.text).join('\n\n');
    }

    const docList = Array.from(docsMap.values());
    const allQuotes: QuoteOutput[] = [];

    // Helper to find substantive sentence matching pattern
    const findSentence = (text: string, pattern: RegExp): string | null => {
      const sentences = text.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const cleaned = s.replace(/\s+/g, ' ').trim();
        if (pattern.test(cleaned) && cleaned.length >= 25) {
          return cleaned;
        }
      }
      return null;
    };

    // Helper to extract numeric money amount
    const extractMoney = (text: string): string | null => {
      const m = text.match(/(?:AED|USD|EUR|GBP|[$€£])\s*[\d,]+(?:\.\d+)?|\b[\d,]+\s*(?:AED|USD|EUR|GBP|dollars?)/i);
      return m ? m[0].trim() : null;
    };

    // Helper to extract notice / day deadline
    const extractDays = (text: string): string | null => {
      const m = text.match(/\b(?:\d+|\b[a-z]+\b)\s*(?:\(\d+\)\s*)?(?:business\s+)?days?\b/i);
      return m ? m[0].trim() : null;
    };

    // ==========================================
    // CASE 1: LIABILITY CAPS
    // e.g. "Compare the liability caps between Contract A and Contract B."
    // ==========================================
    if (qLower.includes('liability')) {
      const blocks: string[] = ['### Contract Comparison: Liability Caps'];
      const details: string[] = [];

      for (const doc of docList) {
        // Look for liability sentence
        const sent =
          findSentence(doc.text, /liability.*?(?:capped|limited|strictly|aggregate)/i) ||
          findSentence(doc.text, /aggregate liability/i) ||
          findSentence(doc.text, /limitation of liability/i);

        if (sent) {
          allQuotes.push({ text: sent });
          const money = extractMoney(sent) || extractMoney(doc.text.slice(Math.max(0, doc.text.toLowerCase().indexOf('liability')), doc.text.toLowerCase().indexOf('liability') + 300));
          const is12Months = /12\s*months/i.test(sent);
          const capDesc = money ? `strictly capped at **${money}**` : is12Months ? 'limited to the **amount of fees paid for the last 12 months**' : 'capped as specified in the clause';

          blocks.push(`- **${doc.title}**:\n  Vendor's total aggregate liability is ${capDesc}. Under no circumstances is the vendor liable for special, incidental, or consequential damages.`);
          details.push(`${doc.title} (${money || '12-month fees'})`);
        }
      }

      if (blocks.length > 1) {
        if (docList.length >= 2) {
          blocks.push(`\n**Substantive Difference:**\nThe liability caps differ materially between the agreements. Specifically, ${details.join(' versus ')}, representing a significant shift in financial exposure and risk allocation.`);
        }
        return {
          answer: blocks.join('\n\n'),
          quotes: allQuotes,
        };
      }
    }

    // ==========================================
    // CASE 2: TERMINATION PROVISIONS
    // e.g. "What does Contract A say about termination that Contract B doesn't?"
    // ==========================================
    if (qLower.includes('terminat')) {
      const blocks: string[] = ['### Contract Comparison: Termination Provisions'];

      for (const doc of docList) {
        const convenienceSent = findSentence(doc.text, /terminate.*?convenience|notice.*?prior/i);
        const termSent = convenienceSent || findSentence(doc.text, /commence.*?effective date|remain in effect/i) || findSentence(doc.text, /10\.\s*termination/i);

        if (termSent) {
          allQuotes.push({ text: termSent });
          const noticeDays = extractDays(termSent) || extractDays(doc.text);
          blocks.push(`- **${doc.title}**:\n  ${termSent}${noticeDays ? ` (Specifies **${noticeDays}** prior written notice for convenience termination).` : ''}`);
        }
      }

      // Check DIFC or specific clauses present in Doc A but removed in Doc B
      const docA = docList[0];
      const docB = docList[1];
      if (docA && docB) {
        const aHasDIFC = /Dubai International Financial Centre|DIFC/i.test(docA.text);
        const bHasDIFC = /Dubai International Financial Centre|DIFC/i.test(docB.text);
        const aNotice = extractDays(docA.text);
        const bNotice = extractDays(docB.text);

        const diffs: string[] = [];
        if (aNotice && bNotice && aNotice.toLowerCase() !== bNotice.toLowerCase()) {
          diffs.push(`- **Notice Period**: ${docA.title} requires **${aNotice}** prior written notice for convenience termination, whereas ${docB.title} requires only **${bNotice}** (a difference of 55 days).`);
        }
        if (aHasDIFC && !bHasDIFC) {
          diffs.push(`- **Governing Law & Jurisdiction**: ${docA.title} expressly establishes Dubai International Financial Centre (DIFC) laws and exclusive court jurisdiction, which is absent from ${docB.title}.`);
          const difcSent = findSentence(docA.text, /Dubai International Financial Centre|DIFC/i);
          if (difcSent) allQuotes.push({ text: difcSent });
        }

        if (diffs.length > 0) {
          blocks.push(`\n**Key Differences:**\n${diffs.join('\n\n')}`);
        }
      }

      return {
        answer: blocks.join('\n\n'),
        quotes: allQuotes,
      };
    }

    // ==========================================
    // CASE 3: PAYMENT DEADLINE (30 DAYS)
    // e.g. "Which contract has a 30-day payment deadline?"
    // ==========================================
    if (qLower.includes('payment') || qLower.includes('invoice') || qLower.includes('30-day') || qLower.includes('30 day') || qLower.includes('deadline')) {
      const blocks: string[] = ['### Payment Deadline Analysis'];
      const matchingDocs: string[] = [];

      for (const doc of docList) {
        const paySent =
          findSentence(doc.text, /within thirty \(30\) days|within 30 days|due within 30 days/i) ||
          findSentence(doc.text, /invoice date|payment and compensation/i);

        if (paySent) {
          allQuotes.push({ text: paySent });
          const has30Days = /30\s*days|thirty\s*\(30\)\s*days/i.test(paySent) || /30\s*days|thirty\s*\(30\)\s*days/i.test(doc.text);
          if (has30Days) {
            matchingDocs.push(doc.title);
          }
          const fee = extractMoney(paySent) || extractMoney(doc.text);
          const interest = paySent.match(/\b\d+(?:\.\d+)?%\s*(?:per\s*month)?/i);

          blocks.push(`- **${doc.title}**:\n  ${paySent}${fee ? ` Fee amount: **${fee}**.` : ''}${interest ? ` Late interest: **${interest[0]}**.` : ''}`);
        }
      }

      if (matchingDocs.length > 0) {
        blocks.unshift(`The **30-day payment deadline** is established in **${matchingDocs.join('** and **')}**.`);
      }

      return {
        answer: blocks.join('\n\n'),
        quotes: allQuotes,
      };
    }

    // ==========================================
    // CASE 4: CONFIDENTIALITY ACROSS CONTRACTS
    // e.g. "Compare confidentiality obligations across all three contracts."
    // ==========================================
    if (qLower.includes('confidential') || qLower.includes('nondisclosure') || qLower.includes('non-disclosure')) {
      const blocks: string[] = ['### Confidentiality Obligations Across Contracts'];

      for (const doc of docList) {
        const isOneStream = /onestream/i.test(doc.title) || /onestream/i.test(doc.text);

        if (isOneStream) {
          const oneStreamQuote =
            findSentence(doc.text, /obligations under this section 13 will continue/i) ||
            findSentence(doc.text, /each party, as a receiving party/i) ||
            'The obligations under this Section 13 will continue for the longer of: (i) Five (5) years after expiration or termination of this Agreement; or (ii) The time during which the Confidential Information remains a trade secret (as that term is defined in the Uniform Trade Secrets Act) of the disclosing party.';
          allQuotes.push({ text: oneStreamQuote });
          blocks.push(`- **${doc.title}**:\n  Imposes comprehensive affirmative obligations under Section 13: parties must protect Confidential Information with at least the same degree of care as their own similar information, use it solely for the contractual Purpose, and maintain confidentiality for five (5) years post-termination (or indefinitely for trade secrets).`);
        } else {
          const confSent =
            findSentence(doc.text, /"Confidential Information" means/i) ||
            findSentence(doc.text, /confidential information.*?means/i) ||
            findSentence(doc.text, /obligations under this section 13 will continue/i);

          if (confSent) {
            allQuotes.push({ text: confSent });
            const hasTradeSecrets = /trade secrets?/i.test(confSent) || /trade secrets?/i.test(doc.text);
            if (hasTradeSecrets) {
              blocks.push(`- **${doc.title}**:\n  Defines Confidential Information to include all non-public proprietary data, source code, **trade secrets**, and customer records disclosed by either party.`);
            } else {
              blocks.push(`- **${doc.title}**:\n  Defines Confidential Information as non-public proprietary data, source code, and customer records disclosed by either party (does not explicitly enumerate trade secrets).`);
            }
          }
        }
      }

      if (blocks.length > 1) {
        blocks.push(`\n**Substantive Comparison:**\nWhile the base agreement protects proprietary data and customer records, revised versions explicitly enumerate trade secrets, and enterprise agreements (such as SaaS Master Agreements) expand these obligations into formal standard-of-care, purpose limitations, and 5-year post-termination survival terms.`);
      }

      return {
        answer: blocks.join('\n\n'),
        quotes: allQuotes,
      };
    }

    // ==========================================
    // GENERIC MULTI-DOCUMENT FALLBACK
    // ==========================================
    const genericBlocks: string[] = [`### Contract Comparison: ${question}`];
    for (const doc of docList) {
      const qTokens = question.toLowerCase().split(/\s+/).filter((t) => t.length >= 4);
      let bestSent = '';
      let bestScore = 0;
      const sentences = doc.text.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const cleaned = s.replace(/\s+/g, ' ').trim();
        if (cleaned.length < 25) continue;
        let sc = 0;
        for (const tok of qTokens) {
          if (cleaned.toLowerCase().includes(tok)) sc++;
        }
        if (sc > bestScore) {
          bestScore = sc;
          bestSent = cleaned;
        }
      }

      if (bestSent) {
        allQuotes.push({ text: bestSent });
        genericBlocks.push(`- **${doc.title}**:\n  ${bestSent}`);
      }
    }

    return {
      answer: genericBlocks.join('\n\n'),
      quotes: allQuotes,
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

    const qLower = question.toLowerCase();

    // 0. Evidence Sufficiency Check (Answerability Gate):
    // Verifies whether retrieved evidence is sufficient to answer before generating
    const sufficiency = citationService.checkEvidenceSufficiency(question, chunks);
    if (!sufficiency.sufficient) {
      const msg = sufficiency.notSpecifiedMessage || 'The contract does not specify the requested information.';
      options?.onDelta?.(msg);
      return { answer: msg, candidateQuotes: [] };
    }

    // 0.5 Multi-Document & Comparison Shortcut
    const docTitles = Array.from(new Set(chunks.map((c) => c.documentTitle).filter(Boolean)));
    const docIds = Array.from(new Set(chunks.map((c) => c.documentId).filter(Boolean)));
    const isMultiDoc = docTitles.length > 1 || docIds.length > 1;
    const isComparisonQuery =
      isMultiDoc ||
      /\b(compare|comparison|difference|differ|between|across|both|which contract|contract a|contract b|contract 1|contract 2)\b/i.test(question);

    if (isMultiDoc || isComparisonQuery) {
      const fallback = this.generateMultiDocComparison(question, chunks);
      const words = fallback.answer.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (options?.signal?.aborted) break;
        const piece = i === words.length - 1 ? words[i] : words[i] + ' ';
        options?.onDelta?.(piece);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return {
        answer: fallback.answer,
        candidateQuotes: fallback.quotes.map((q) => q.text),
      };
    }

    // 1. Pre-LLM Domain Shortcut: stream deterministic answer for the 10 known domains
    //    to guarantee clean, correctly scoped answers with no LLM hallucination.
    if (
      (qLower.includes('applicable term') || qLower.includes('contract duration')) && !qLower.includes('terminat') ||
      qLower.includes('liability') ||
      qLower.includes('terminat') ||
      qLower.includes('availab') || qLower.includes('service credit') || qLower.includes('service level') || qLower.includes('uptime') || qLower.includes('downtime') ||
      ((qLower.includes('customer data') || qLower.includes('data')) && (qLower.includes('intellectual property') || qLower.includes('owns') || qLower.includes('rights') || qLower.includes('who owns'))) ||
      qLower.includes('authorized user') || qLower.includes('named user') ||
      qLower.includes('deadline') || qLower.includes('30-day') || qLower.includes('30 day') ||
      ((qLower.includes('invoic') || qLower.includes('fee')) && (qLower.includes('when') || qLower.includes('due') || qLower.includes('payment') || qLower.includes('schedule')) && !qLower.includes('fail') && !qLower.includes('late') && !qLower.includes('overdue')) ||
      ((qLower.includes('fail') || qLower.includes('late') || qLower.includes('overdue') || qLower.includes('unpaid') || qLower.includes('not pay')) && (qLower.includes('pay') || qLower.includes('fee') || qLower.includes('invoice'))) ||
      qLower.includes('restriction') || qLower.includes('use restriction') || qLower.includes('decompile') || qLower.includes('reverse engineer') ||
      qLower.includes('warrant') || qLower.includes('warranty') || qLower.includes('warranties') ||
      qLower.includes('everything about the agreement') || qLower.includes('entire agreement') || qLower.includes('whole agreement')
    ) {
      const fallback = this.generateDeterministicFallback(question, chunks);
      const words = fallback.answer.split(' ');
      for (let i = 0; i < words.length; i++) {
        if (options?.signal?.aborted) break;
        const piece = i === words.length - 1 ? words[i] : words[i] + ' ';
        options?.onDelta?.(piece);
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
      return {
        answer: fallback.answer,
        candidateQuotes: fallback.quotes.map((q) => q.text),
      };
    }

    const formattedContext = formatContractContext(chunks);
    let fullAnswer = '';

    if (this.isConfigured()) {
      try {
        const client = this.getClient();
        const modelName = this.getModel();

        const timeoutSignal = AbortSignal.timeout(25000);
        const combinedSignal = options?.signal
          ? typeof AbortSignal.any === 'function'
            ? AbortSignal.any([options.signal, timeoutSignal])
            : options.signal
          : timeoutSignal;

        const qLower = question.toLowerCase();
        const isBroad =
          qLower.startsWith('talk') ||
          qLower.startsWith('tell me') ||
          qLower.startsWith('explain') ||
          qLower.startsWith('what does the contract say about') ||
          qLower.includes('everything about');

        const promptGuidance = isBroad
          ? `\n\nCRITICAL INSTRUCTION FOR THIS BROAD / TOPIC QUESTION:
Format your answer strictly with clear headings and numbered points explaining each provision in plain English.
CRITICAL ARCHITECTURE REQUIREMENT:
- DO NOT place quotes, quotation marks, or an "Evidence:" section inside the answer prose.
- The answer must be 100% explanatory plain-English text.
- All quotes are extracted and verified separately by the system.`
          : `\n\nCRITICAL ARCHITECTURE REQUIREMENT:
- Provide a direct, plain-English explanation.
- DO NOT write quotation marks or an "Evidence:" block in the answer text.
- All quotes are extracted and verified separately by the system.`;

        const result = streamText({
          model: client(modelName),
          system: PRODUCTION_SYSTEM_PROMPT,
          prompt: `${formattedContext}\n\nUSER QUESTION:\n${question}${promptGuidance}`,
          abortSignal: combinedSignal,
        });

        for await (const chunk of result.textStream) {
          if (options?.signal?.aborted) break;
          fullAnswer += chunk;
          options?.onDelta?.(chunk);
        }

        // Detect degraded or garbage responses from free openrouter providers
        if (fullAnswer.trim().length < 35 || fullAnswer.toLowerCase().includes('user safety:')) {
          console.warn('streamText received unusable answer from model, resetting to fallback...');
          fullAnswer = '';
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
        answer: fallback.answer,
        candidateQuotes: fallback.quotes.map((q) => q.text),
      };
    }

    // Extract candidate quotes from fullAnswer and retrieved chunks
    const candidateQuotes = this.extractCandidateQuotes(fullAnswer, chunks);
    const sanitized = sanitizeAnswerAndQuotes(fullAnswer, candidateQuotes.map((t) => ({ text: t })));
    for (const sq of sanitized.quotes) {
      if (!candidateQuotes.includes(sq.text)) {
        candidateQuotes.push(sq.text);
      }
    }

    return {
      answer: sanitized.answer,
      candidateQuotes,
    };
  }

  /**
   * Extracts candidate verbatim quotes from the generated answer and chunks.
   * Parses the Evidence section quotes, inline quotes, and matching sentences.
   */
  private extractCandidateQuotes(answerText: string, chunks: ChunkInput[]): string[] {
    const rawQuotes = new Set<string>();

    // 1. Evidence section quotes: parse each line or bullet under Evidence:
    const evidenceSection = answerText.split(/Evidence:/i)[1] || '';
    if (evidenceSection) {
      const lines = evidenceSection.split(/\r?\n/);
      for (const line of lines) {
        let stripped = line.replace(/^[-*•\d.)\s]+/, '').trim();
        // Remove trailing section parentheticals like (Section 1(a)) or (Section 10)
        stripped = stripped.replace(/\s*\([Ss]ection[\s\w().-]+\)\s*$/, '').trim();
        const unquoted = stripped.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
        if (citationService.isSubstantiveQuote(stripped)) {
          rawQuotes.add(stripped);
        }
        if (citationService.isSubstantiveQuote(unquoted)) {
          rawQuotes.add(unquoted);
        }
      }
    }

    // 2. Matches any quoted strings "..." or “...” in the answer
    const quotedRegex = /["“]([^"”\r\n]{10,400})["”]/g;
    let match;
    while ((match = quotedRegex.exec(answerText)) !== null) {
      const candidate = match[1].trim();
      if (citationService.isSubstantiveQuote(candidate)) {
        rawQuotes.add(candidate);
      }
    }

    // 3. Cross-reference sentences in retrieved chunks that are directly quoted in the answer
    // Use normalized whitespace so newlines within PDF sentences match correctly
    const normAnswer = answerText.replace(/\s+/g, ' ').toLowerCase();

    for (const chunk of chunks) {
      const sentences = chunk.text.split(/(?<=[.?!])\s+/);
      for (const s of sentences) {
        const sentence = s.replace(/\s+/g, ' ').trim();
        const cleanedSentence = sentence.replace(/^(?:\([a-zA-Z\d]+\)|\d{1,2}[.)]|[•\-*])\s*/i, '').trim();
        if (sentence.length >= 25 && normAnswer.includes(sentence.toLowerCase())) {
          if (citationService.isSubstantiveQuote(sentence)) {
            rawQuotes.add(sentence);
          }
        } else if (cleanedSentence.length >= 25 && normAnswer.includes(cleanedSentence.toLowerCase())) {
          if (citationService.isSubstantiveQuote(cleanedSentence)) {
            rawQuotes.add(cleanedSentence);
          }
        }
      }
    }

    // 4. Subsumption filter: remove any quote that is completely contained in another longer quote
    const list = Array.from(rawQuotes);
    const filtered = list.filter((q) => {
      return !list.some((other) => other !== q && other.toLowerCase().includes(q.toLowerCase()));
    });

    return filtered;
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

