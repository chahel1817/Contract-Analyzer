const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export interface DocumentItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  status: 'PROCESSING' | 'READY' | 'FAILED' | string;
  pageCount?: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt?: string;
  _count?: {
    chunks: number;
    conversations: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  count?: number;
}

export async function fetchDocuments(): Promise<ApiResponse<DocumentItem[]>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents`, { cache: 'no-store' });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch documents',
      data: [],
    };
  }
}

export async function fetchDocumentById(id: string): Promise<ApiResponse<any>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, { cache: 'no-store' });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch document',
    };
  }
}

export async function uploadDocument(file: File): Promise<ApiResponse<DocumentItem>> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE_URL}/documents/upload`, {
      method: 'POST',
      body: formData,
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Network error while uploading document',
    };
  }
}

export interface CitationItem {
  id: string;
  messageId?: string;
  documentId?: string;
  chunkId?: string | null;
  quote: string;
  verified: boolean;
  startOffset?: number | null;
  endOffset?: number | null;
  pageStart?: number | null;
  pageEnd?: number | null;
  confidence?: number | null;
  createdAt?: string;
}

export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  citations?: CitationItem[];
  isStreaming?: boolean;
  statusText?: string;
}

export interface ConversationItem {
  id: string;
  documentId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export async function deleteDocument(id: string): Promise<ApiResponse<{ id: string }>> {
  try {
    const res = await fetch(`${API_BASE_URL}/documents/${id}`, {
      method: 'DELETE',
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to delete document',
    };
  }
}

export async function fetchConversations(documentId: string): Promise<ApiResponse<ConversationItem[]>> {
  try {
    const res = await fetch(`${API_BASE_URL}/conversations/${documentId}`, {
      cache: 'no-store',
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to fetch conversations',
      data: [],
    };
  }
}

export interface StreamChatOptions {
  documentId?: string;
  documentIds?: string[];
  question: string;
  conversationId?: string;
  signal?: AbortSignal;
  onStatus?: (status: string) => void;
  onUserMessage?: (msg: ChatMessage) => void;
  onDelta?: (text: string) => void;
  onDone?: (data: {
    conversationId: string;
    assistantMessage: ChatMessage;
    citations: CitationItem[];
    answer?: string;
  }) => void;
  onError?: (error: string) => void;
}

export async function streamChatMessage({
  documentId,
  documentIds,
  question,
  conversationId,
  signal,
  onStatus,
  onUserMessage,
  onDelta,
  onDone,
  onError,
}: StreamChatOptions): Promise<void> {
  try {
    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        documentId,
        documentIds,
        question,
        conversationId,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `HTTP Error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        errorMsg = parsed.error || errorMsg;
      } catch {}
      onError?.(errorMsg);
      return;
    }

    if (!response.body) {
      onError?.('No response stream available');
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = 'message';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('event: ')) {
          currentEvent = trimmed.slice(7).trim();
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const rawData = trimmed.slice(6).trim();
          try {
            const data = JSON.parse(rawData);

            if (currentEvent === 'status') {
              onStatus?.(data.message || data.status || '');
            } else if (currentEvent === 'userMessage') {
              if (data.userMessage) onUserMessage?.(data.userMessage);
            } else if (currentEvent === 'delta') {
              onDelta?.(data.text || '');
            } else if (currentEvent === 'done') {
              onDone?.(data);
            } else if (currentEvent === 'error') {
              onError?.(data.error || 'Unknown error occurred');
            }
          } catch (e) {
            console.error('Failed to parse SSE data:', rawData, e);
          }
        }
      }
    }
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log('Stream aborted by user');
      return;
    }
    onError?.(err.message || 'Stream connection failed');
  }
}

export async function sendChatMessage(documentId: string, message: string) {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentId, question: message }),
  });
  return res.json();
}

export type SignificanceLevel = 'High' | 'Medium' | 'Low';
export type ChangeType = 'modified' | 'added' | 'removed' | 'unchanged';

export interface ClauseComparison {
  id: string;
  clause: string;
  oldText: string | null;
  newText: string | null;
  changeType: ChangeType;
  summary: string;
  significance: SignificanceLevel;
}

export interface ComparisonResult {
  documentA: { id: string; title: string; fileName: string };
  documentB: { id: string; title: string; fileName: string };
  executiveSummary: string;
  totalChanges: number;
  counts: {
    high: number;
    medium: number;
    low: number;
    added: number;
    removed: number;
    modified: number;
  };
  comparisons: ClauseComparison[];
  changes?: ClauseComparison[];
}

export async function compareContracts(
  docAId: string,
  docBId: string
): Promise<ApiResponse<ComparisonResult>> {
  try {
    const res = await fetch(`${API_BASE_URL}/comparison`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentA: docAId,
        documentB: docBId,
        docAId,
        docBId,
      }),
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to compare contracts',
    };
  }
}

export interface AgentStep {
  round: number;
  thought?: string;
  toolCall?: {
    toolName: string;
    args: any;
    result?: any;
    error?: string;
    isMalformed?: boolean;
  };
}

export interface AgentResearchResult {
  question: string;
  answer: string;
  rounds: number;
  maxRounds: number;
  steps: AgentStep[];
  citations: CitationItem[];
  status: 'completed' | 'max_rounds_reached' | 'failed';
  evidenceGathered: string[];
}

export async function runAgentResearch(
  question: string,
  documentId?: string,
  maxRounds?: number
): Promise<ApiResponse<AgentResearchResult>> {
  try {
    const res = await fetch(`${API_BASE_URL}/chat/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, documentId, maxRounds }),
    });
    return await res.json();
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to execute agentic research',
    };
  }
}


