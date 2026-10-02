'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  fetchDocumentById,
  fetchConversations,
  streamChatMessage,
  ChatMessage,
  CitationItem,
  ConversationItem,
} from '@/lib/api';
import Message from '@/components/Message';
import { HighlightTarget } from '@/lib/citation-highlight';
import { Button } from '@/components/ui/button';
import {
  ChevronLeft,
  Send,
  Square,
  Sparkles,
  RotateCcw,
  BookOpen,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Search,
  Columns,
  Highlighter,
} from 'lucide-react';

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-full bg-slate-900/60 border border-slate-800 rounded-2xl min-h-[400px]">
      <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
      <p className="text-xs text-slate-400">Loading document viewer...</p>
    </div>
  ),
});

const SUGGESTED_PROMPTS = [
  'What are the payment terms and late interest rates?',
  'What is the governing law and arbitration venue?',
  'What are the termination conditions and notice periods?',
  'What are the liability caps and indemnification obligations?',
];

export default function DocumentChatPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [document, setDocument] = useState<any | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Split-Screen & Citation Highlighting State (Requirement 17 & 18)
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [activeHighlight, setActiveHighlight] = useState<HighlightTarget | null>(null);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);

  // Abort controller for Stop generation
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom of message list
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages]);

  // Load document and conversation history
  useEffect(() => {
    if (!id) return;

    async function loadData() {
      setIsLoadingHistory(true);
      setError(null);

      try {
        // 1. Fetch document info
        const docRes = await fetchDocumentById(id);
        if (docRes.success && docRes.data) {
          setDocument(docRes.data);
        } else {
          setError(docRes.error || 'Failed to load document details.');
          return;
        }

        // 2. Fetch conversations (Chat persistence - Requirement 16)
        const convRes = await fetchConversations(id);
        if (convRes.success && convRes.data && convRes.data.length > 0) {
          setConversations(convRes.data);
          const latestConv = convRes.data[0];
          setActiveConversationId(latestConv.id);
          setMessages(latestConv.messages || []);
        } else {
          setConversations([]);
          setMessages([]);
        }
      } catch (err: any) {
        setError(err.message || 'Error loading chat history.');
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadData();
  }, [id]);

  // Start new conversation
  const handleNewConversation = () => {
    if (isGenerating) handleStop();
    setActiveConversationId(null);
    setMessages([]);
    setActiveHighlight(null);
    setSelectedCitationId(null);
    if (textareaRef.current) textareaRef.current.focus();
  };

  // Stop generation (Requirement 14 & 15)
  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setMessages((prev) =>
      prev.map((msg) =>
        msg.isStreaming ? { ...msg, isStreaming: false, statusText: undefined } : msg
      )
    );
  };

  // Requirement 17: Citation clicking sends documentId, startOffset, endOffset to viewer
  const handleSelectCitation = (citation: CitationItem) => {
    setSelectedCitationId(citation.id);
    const target: HighlightTarget = {
      quote: citation.quote,
      startOffset: citation.startOffset ?? undefined,
      endOffset: citation.endOffset ?? undefined,
      pageStart: citation.pageStart ?? 1,
      pageEnd: citation.pageEnd ?? 1,
    };
    setActiveHighlight(target);

    // Auto-open split view so the user immediately sees the highlighted passage!
    setIsSplitView(true);
  };

  // Send message with streaming (Requirement 14 & 15)
  const handleSendMessage = async (queryToSend?: string) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || isGenerating || !id) return;

    setInputQuery('');
    setError(null);
    setIsGenerating(true);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    // Append optimistic user message
    const optimisticUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    // Append streaming assistant placeholder
    const optimisticAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      statusText: 'Searching contract clauses...',
      citations: [],
    };

    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);

    // Setup abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamChatMessage({
        documentId: id,
        question: text,
        conversationId: activeConversationId || undefined,
        signal: controller.signal,
        onStatus: (status) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMessageId ? { ...m, statusText: status } : m))
          );
        },
        onUserMessage: (savedUserMsg) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === userMessageId ? { ...m, id: savedUserMsg.id } : m))
          );
        },
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: m.content + delta,
                    statusText: undefined,
                  }
                : m
            )
          );
        },
        onDone: (data) => {
          if (data.conversationId) {
            setActiveConversationId(data.conversationId);
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    id: data.assistantMessage?.id || m.id,
                    content: data.assistantMessage?.content || data.answer || m.content || '',
                    citations: data.citations || data.assistantMessage?.citations || [],
                    isStreaming: false,
                    statusText: undefined,
                  }
                : m
            )
          );
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
        onError: (errMsg) => {
          setError(errMsg);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: m.content || `An error occurred: ${errMsg}`,
                    isStreaming: false,
                    statusText: undefined,
                  }
                : m
            )
          );
          setIsGenerating(false);
          abortControllerRef.current = null;
        },
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to stream response.');
      }
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleJumpToPage = (pageNumber: number) => {
    if (isSplitView) {
      setActiveHighlight((prev) => (prev ? { ...prev, pageStart: pageNumber } : { quote: '', pageStart: pageNumber }));
    } else {
      router.push(`/documents/${id}?page=${pageNumber}`);
    }
  };

  const fileUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'}/documents/${id}/file`;
  const isPdf = document?.fileName?.toLowerCase().endsWith('.pdf');

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200 overflow-hidden">
      {/* Decorative Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-1/3 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Navigation Bar */}
      <header className="shrink-0 h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3 overflow-hidden">
          <Link
            href={`/documents/${id}`}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            title="Back to Document Details"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-100 truncate max-w-xs sm:max-w-md">
                {document?.title || document?.fileName || 'Contract Chat'}
              </h1>
              {document?.status === 'READY' && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" /> Ready
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {document?.fileName} • {document?.chunks?.length || 0} chunks indexed
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Split-Screen Viewer Toggle (Requirement 17 & 18) */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSplitView(!isSplitView)}
            className={`text-xs h-8 px-3 border-slate-800 flex items-center gap-1.5 transition-all ${
              isSplitView
                ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'
            }`}
            title="Toggle Split-Screen Contract Viewer"
          >
            <Columns className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">
              {isSplitView ? 'Close Split View' : 'Split View'}
            </span>
          </Button>

          <Link href={`/documents/${id}`}>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 px-3 border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline">Full Viewer</span>
            </Button>
          </Link>

          <Button
            onClick={handleNewConversation}
            size="sm"
            variant="ghost"
            className="text-xs h-8 px-3 text-slate-400 hover:text-slate-200 hover:bg-slate-900 flex items-center gap-1.5"
            title="Start New Conversation"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
        </div>
      </header>

      {/* Main Body: Split View or Full Chat */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Chat Area */}
        <div
          className={`flex flex-col h-full overflow-hidden transition-all duration-300 ${
            isSplitView ? 'w-full lg:w-1/2 border-r border-slate-800/80' : 'w-full'
          }`}
        >
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
              {isLoadingHistory ? (
                <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  <p className="text-xs text-slate-400">Loading conversation history...</p>
                </div>
              ) : messages.length === 0 ? (
                /* Empty State */
                <div className="py-12 sm:py-20 text-center max-w-xl mx-auto space-y-6">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-xl shadow-indigo-500/10">
                    <Sparkles className="w-7 h-7" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-slate-100">
                      Ask Questions About This Contract
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                      Every answer is strictly grounded in the document text with{' '}
                      <span className="text-emerald-400 font-medium">verifiable quotes</span>.
                      Click any quote to highlight the exact passage in the contract.
                    </p>
                  </div>

                  {/* Prompt Suggestions */}
                  <div className="space-y-2 pt-2 text-left">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                      Suggested Questions
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SUGGESTED_PROMPTS.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(prompt)}
                          className="p-3 text-left rounded-xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 text-xs text-slate-300 hover:text-slate-100 transition-all flex items-start gap-2 shadow-sm"
                        >
                          <Search className="w-3.5 h-3.5 text-indigo-400 shrink-0 mt-0.5" />
                          <span>{prompt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Message List */
                messages.map((message) => (
                  <Message
                    key={message.id}
                    message={message}
                    onJumpToPage={handleJumpToPage}
                    documentId={id}
                    onSelectCitation={handleSelectCitation}
                    selectedCitationId={selectedCitationId || undefined}
                  />
                ))
              )}

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sticky Input Dock */}
          <div className="shrink-0 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-xl p-4">
            <div className="max-w-3xl mx-auto space-y-2">
              <div className="relative flex items-end gap-2 bg-slate-900/90 border border-slate-800 focus-within:border-indigo-500/60 rounded-2xl p-2 transition-all shadow-xl">
                <textarea
                  ref={textareaRef}
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about clauses, terms, payment, or liabilities... (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  disabled={isGenerating}
                  className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-0 px-2 py-1 max-h-32 min-h-[44px]"
                />

                <div className="flex items-center gap-1.5 shrink-0 pb-1">
                  {isGenerating ? (
                    <Button
                      onClick={handleStop}
                      size="sm"
                      className="bg-rose-600 hover:bg-rose-500 text-white text-xs h-9 px-3 rounded-xl flex items-center gap-1.5 shadow-lg shadow-rose-600/20"
                      title="Stop generation"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop</span>
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleSendMessage()}
                      disabled={!inputQuery.trim() || isGenerating}
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Send</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span>Verified RAG with interactive quote highlighting</span>
                <span>Press Enter to send</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Split View Live Viewer (Requirement 17 & 18) */}
        {isSplitView && (
          <div className="hidden lg:flex lg:w-1/2 h-full flex-col bg-slate-950 p-4 overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {isPdf ? (
              <PdfViewer
                url={fileUrl}
                initialPage={activeHighlight?.pageStart || 1}
                fileName={document?.fileName}
                highlightTarget={activeHighlight}
                onClearHighlight={() => {
                  setActiveHighlight(null);
                  setSelectedCitationId(null);
                }}
              />
            ) : (
              <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl p-5 overflow-auto">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                  <div className="flex items-center space-x-2 text-xs text-slate-300">
                    <BookOpen className="w-4 h-4 text-indigo-400" />
                    <span className="font-medium">DOCX Text View</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Word Document
                  </span>
                </div>

                {activeHighlight?.quote && (
                  <div className="mb-3 p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between text-xs text-amber-200">
                    <span className="flex items-center gap-1.5 font-medium truncate max-w-xs">
                      <Highlighter className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      &ldquo;{activeHighlight.quote}&rdquo;
                    </span>
                    <button
                      onClick={() => setActiveHighlight(null)}
                      className="text-amber-300 hover:text-white"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="prose prose-invert max-w-none text-slate-300 text-xs whitespace-pre-wrap leading-relaxed">
                  {document?.extractedText || 'No text available'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
