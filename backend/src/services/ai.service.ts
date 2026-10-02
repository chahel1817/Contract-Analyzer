import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export class AiService {
  private isConfigured(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  async summarizeContract(text: string): Promise<string> {
    if (!this.isConfigured()) {
      return `[Mock AI Summary] Contract length: ${text.length} characters. Configure OPENAI_API_KEY for complete LLM-driven contract summarization.`;
    }

    try {
      const response = await generateText({
        model: openai('gpt-4o-mini'),
        prompt: `You are an expert legal contract analyst. Provide a comprehensive summary of the following contract, highlighting:
1. Executive Summary & Purpose
2. Key Parties & Obligations
3. Financial Terms & Payment Schedules
4. Term, Termination & Renewal Provisions
5. Key Liabilities, Warranties & Indemnities
6. High-Risk Clauses or Red Flags

Contract Text:
${text.slice(0, 30000)}`,
      });

      return response.text;
    } catch (error: any) {
      console.error('Error generating summary:', error);
      return `Summary generation failed: ${error.message}`;
    }
  }

  async answerQuestion(contextChunks: string[], question: string): Promise<string> {
    if (!this.isConfigured()) {
      return `Based on the provided contract excerpts: "${question}". (Set OPENAI_API_KEY in .env for live AI answers). Context snippets: ${contextChunks.slice(0, 2).join(' ')}`;
    }

    const context = contextChunks.map((chunk, i) => `[Excerpt ${i + 1}]:\n${chunk}`).join('\n\n');

    const response = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: `You are a contract analysis AI assistant. Answer the user's question accurately using ONLY the contract excerpts provided below. Cite relevant sections and quote exact phrases where appropriate.

Context Excerpts:
${context}

User Question:
${question}`,
    });

    return response.text;
  }
}

export const aiService = new AiService();
