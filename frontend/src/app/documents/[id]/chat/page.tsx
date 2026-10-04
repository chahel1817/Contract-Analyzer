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
    <div className="flex flex-col items-center justify-center h-full bg-white border border-neutral-200 rounded-2xl min-h-[400px]">
      <Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
      <p className="text-xs text-neutral-400">Loading document viewer...</p>
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

  // Split-Screen & Citation Highlighting State
  const [isSplitView, setIsSplitView] = useState<boolean>(false);
  const [splitViewMode, setSplitViewMode] = useState<'pdf' | 'text'>('pdf');
  const [activeHighlight, setActiveHighlight] = useState<HighlightTarget | null>(null);
  const [selectedCitationId, setSelectedCitationId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        const docRes = await fetchDocumentById(id);
        if (docRes.success && docRes.data) {
          setDocument(docRes.data);
        } else {
          setError(docRes.error || 'Failed to load document details.');
          return;
        }

        const convRes = await fetchConversations(id);
        if (convRes.success && convRes.data && convRes.data.length > 0) {
          setConversations(convRes.data);
          const latestConv = convRes.data[0];
          setActiveConversationId(latestConv.id);
          if (latestConv.messages && latestConv.messages.length > 0) {
            setMessages(latestConv.messages);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Error initializing contract chat.');
      } finally {
        setIsLoadingHistory(false);
      }
    }

    loadData();
  }, [id]);

  const handleSelectCitation = (citation: CitationItem) => {
    setSelectedCitationId(citation.id);
    setActiveHighlight({
      quote: citation.quote,
      startOffset: citation.startOffset ?? undefined,
      endOffset: citation.endOffset ?? undefined,
      pageStart: citation.pageStart ?? 1,
      pageEnd: citation.pageEnd ?? undefined,
    });

    if (!isSplitView) {
      setIsSplitView(true);
    }
  };

  const handleNewConversation = () => {
    if (isGenerating) handleStop();
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setSelectedCitationId(null);
    setActiveHighlight(null);
  };

  const handleSendMessage = async (textOverride?: string) => {
    const text = (textOverride || inputQuery).trim();
    if (!text || isGenerating) return;

    setError(null);
    setInputQuery('');
    setIsGenerating(true);

    const userMessageId = `user-${Date.now()}`;
    const assistantMessageId = `assistant-${Date.now()}`;

    const optimisticUserMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const optimisticAssistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      statusText: 'Retrieving contract excerpts...',
      citations: [],
    };

    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedContent = '';

    try {
      await streamChatMessage({
        documentId: id,
        question: text,
        conversationId: activeConversationId || undefined,
        signal: controller.signal,
        onStatus: (status) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId ? { ...m, statusText: status } : m
            )
          );
        },
        onDelta: (delta) => {
          accumulatedContent += delta;
          const currentText = accumulatedContent;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content: currentText,
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
          const finalAnswer = data.assistantMessage?.content || data.answer || accumulatedContent;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    id: data.assistantMessage?.id || m.id,
                    content: finalAnswer,
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

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false, statusText: undefined } : m))
      );
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
    <div className="flex flex-col h-screen bg-[#fafaf9] text-neutral-900 font-sans selection:bg-amber-500/20 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="shrink-0 h-16 border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3 overflow-hidden">
          <Link
            href={`/documents/${id}`}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors"
            title="Back to Document Details"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-neutral-900 truncate max-w-xs sm:max-w-md">
                {document?.title || document?.fileName || 'Contract Chat'}
              </h1>
              {document?.status === 'READY' && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 truncate">
              {document?.fileName} &bull; {document?.chunks?.length || 0} chunks indexed
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Talk to Lexi shortcut */}
          <Link
            href={`/assistant?docId=${id}`}
            className="text-xs h-8 px-3 rounded-xl bg-neutral-900 hover:bg-black text-white flex items-center gap-1.5 font-bold transition shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span className="hidden sm:inline">Lexi Assistant</span>
          </Link>

          {/* Split-Screen Viewer Toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSplitView(!isSplitView)}
            className={`text-xs h-8 px-3 border-neutral-200 flex items-center gap-1.5 transition-all cursor-pointer ${
              isSplitView
                ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold'
                : 'bg-white hover:bg-neutral-100 text-neutral-700'
            }`}
            title="Toggle Split-Screen Contract Viewer"
          >
            <Columns className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">
              {isSplitView ? 'Close Split View' : 'Split View'}
            </span>
          </Button>

          <Link href={`/documents/${id}`}>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 px-3 border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-neutral-500" />
              <span className="hidden sm:inline">Full Viewer</span>
            </Button>
          </Link>

          <Button
            onClick={handleNewConversation}
            size="sm"
            variant="ghost"
            className="text-xs h-8 px-3 text-neutral-500 hover:text-neutral-900 cursor-pointer flex items-center gap-1.5"
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
            isSplitView ? 'w-full lg:w-1/2 border-r border-neutral-200/80' : 'w-full'
          }`}
        >
          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
              {isLoadingHistory ? (
                <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
                  <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                  <p className="text-xs text-neutral-400">Loading conversation history...</p>
                </div>
              ) : messages.length === 0 ? (
                /* Empty State */
                <div className="py-12 sm:py-20 text-center max-w-xl mx-auto space-y-6">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-600 shadow-2xs">
                    <Sparkles className="w-7 h-7 fill-current" />
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-neutral-900">
                      Ask Questions About This Contract
                    </h3>
                    <p className="text-xs text-neutral-500 leading-relaxed max-w-md mx-auto">
                      Every answer is strictly grounded in the document text with{' '}
                      <span className="text-emerald-700 font-semibold">verifiable quotes</span>.
                      Click any quote to highlight the exact passage in the contract.
                    </p>
                  </div>

                  {/* Prompt Suggestions */}
                  <div className="space-y-2 pt-2 text-left">
                    <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">
                      Suggested Questions
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {SUGGESTED_PROMPTS.map((prompt, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(prompt)}
                          className="p-3 text-left rounded-2xl bg-white border border-neutral-200/90 hover:border-amber-400 hover:bg-neutral-50 text-xs text-neutral-800 transition-all flex items-start gap-2 shadow-2xs cursor-pointer"
                        >
                          <Search className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
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
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Sticky Input Dock */}
          <div className="shrink-0 border-t border-neutral-200/80 bg-white/80 backdrop-blur-xl p-4">
            <div className="max-w-3xl mx-auto space-y-2">
              <div className="relative flex items-end gap-2 bg-[#f1f1f3] border border-neutral-200/80 focus-within:border-amber-400/80 focus-within:bg-white rounded-2xl p-2 transition-all shadow-xs">
                <textarea
                  ref={textareaRef}
                  value={inputQuery}
                  onChange={(e) => setInputQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question about clauses, terms, payment, or liabilities... (Enter to send, Shift+Enter for new line)"
                  rows={2}
                  disabled={isGenerating}
                  className="flex-1 bg-transparent border-0 resize-none text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-0 px-2 py-1 max-h-32 min-h-[44px]"
                />

                <div className="flex items-center gap-1.5 shrink-0 pb-1">
                  {isGenerating ? (
                    <Button
                      onClick={handleStop}
                      size="sm"
                      className="bg-rose-600 hover:bg-rose-700 text-white text-xs h-9 px-3 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer"
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
                      className="bg-neutral-900 hover:bg-black disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5 shadow-xs transition-all font-semibold cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Send</span>
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
                <span>Verified RAG with interactive quote highlighting</span>
                <span>Press Enter to send</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Split View Live Viewer */}
        {isSplitView && (
          <div className="hidden lg:flex lg:w-1/2 h-full flex-col bg-[#f5f5f4] p-4 overflow-hidden animate-in slide-in-from-right-4 duration-200">
            {isPdf && splitViewMode === 'pdf' ? (
              <PdfViewer
                url={fileUrl}
                initialPage={activeHighlight?.pageStart || 1}
                fileName={document?.fileName}
                highlightTarget={activeHighlight}
                onClearHighlight={() => {
                  setActiveHighlight(null);
                  setSelectedCitationId(null);
                }}
                onFallbackToText={() => setSplitViewMode('text')}
              />
            ) : (
              <div className="flex flex-col h-full bg-white border border-neutral-200 rounded-2xl p-5 overflow-auto shadow-2xs">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-200">
                  <div className="flex items-center space-x-2 text-xs text-neutral-700 font-semibold">
                    <BookOpen className="w-4 h-4 text-amber-500" />
                    <span>{isPdf ? 'Extracted Contract Text View' : 'DOCX Text View'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isPdf && (
                      <button
                        onClick={() => setSplitViewMode('pdf')}
                        className="text-[10px] px-2 py-0.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium cursor-pointer"
                      >
                        Try PDF View
                      </button>
                    )}
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-bold">
                      {isPdf ? 'Parsed Text' : 'Word Document'}
                    </span>
                  </div>
                </div>

                {activeHighlight?.quote && (
                  <div className="mb-3 p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-900">
                    <span className="flex items-center gap-1.5 font-medium truncate max-w-xs">
                      <Highlighter className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      &ldquo;{activeHighlight.quote}&rdquo;
                    </span>
                    <button
                      onClick={() => setActiveHighlight(null)}
                      className="text-amber-700 hover:text-neutral-900 font-bold cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                )}

                <div className="text-neutral-800 text-xs whitespace-pre-wrap leading-relaxed">
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
