'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  fetchDocuments,
  streamChatMessage,
  DocumentItem,
  ChatMessage,
  CitationItem,
} from '@/lib/api';
import Message from '@/components/Message';
import { Button } from '@/components/ui/button';
import {
  MessageSquare,
  FileText,
  ChevronRight,
  Loader2,
  Sparkles,
  ChevronLeft,
  CheckSquare,
  Square,
  Layers,
  Send,
  RotateCcw,
  CheckCircle2,
  Search,
  Plus,
  X,
  AlertCircle,
} from 'lucide-react';

const MULTI_DOC_SUGGESTIONS = [
  'Compare the liability caps and indemnification obligations across these contracts.',
  'Which agreement has stricter termination conditions and notice periods?',
  'Compare payment terms, due dates, and interest penalties between the agreements.',
  'What are the governing laws and dispute resolution forums for each contract?',
];

function MultiDocumentChatContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get('docId');

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isChatActive, setIsChatActive] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages]);

  // Load available ready documents
  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetchDocuments();
        if (res.success && res.data) {
          const readyDocs = res.data.filter((d) => d.status === 'READY');
          setDocuments(readyDocs);

          // If docId is specified in URL, pre-select it
          if (initialDocId) {
            setSelectedDocIds([initialDocId]);
            setIsChatActive(true);
          }
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    }

    loadDocs();
  }, [initialDocId]);

  // Document selection toggles (Requirement 19)
  const toggleDocument = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedDocIds(documents.map((d) => d.id));
  };

  const deselectAll = () => {
    setSelectedDocIds([]);
  };

  // Map of documentId -> documentTitle for citation attribution
  const documentTitlesMap: Record<string, string> = {};
  for (const doc of documents) {
    documentTitlesMap[doc.id] = doc.title || doc.fileName;
  }

  // Stop generation
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

  // Send message across multiple documents (Requirement 20)
  const handleSendMessage = async (queryToSend?: string) => {
    const text = (queryToSend || inputQuery).trim();
    if (!text || isGenerating || selectedDocIds.length === 0) return;

    setInputQuery('');
    setError(null);
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
      statusText: `Searching across ${selectedDocIds.length} contract${selectedDocIds.length !== 1 ? 's' : ''}...`,
      citations: [],
    };

    setMessages((prev) => [...prev, optimisticUserMessage, optimisticAssistantMessage]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      await streamChatMessage({
        documentIds: selectedDocIds,
        question: text,
        conversationId: conversationId || undefined,
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
            setConversationId(data.conversationId);
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

  // If in selection mode
  if (!isChatActive) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 sm:p-12 selection:bg-indigo-500/30">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-400" />
                  Multi-Contract Q&A & Analysis
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Select multiple contracts below to compare provisions, cross-reference clauses, and verify citations across all documents.
                </p>
              </div>
            </div>

            {documents.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={selectAll}
                  className="text-xs h-8 border-slate-800 bg-slate-900 text-slate-300"
                >
                  Select All
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={deselectAll}
                  className="text-xs h-8 text-slate-400 hover:text-slate-200"
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {/* Document Checklist (Requirement 19) */}
          {loading ? (
            <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              <p className="text-xs text-slate-400">Loading contracts for selection...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
              <FileText className="w-10 h-10 text-slate-600 mx-auto" />
              <h3 className="text-sm font-semibold text-slate-300">No Ready Contracts</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Please upload contracts on the dashboard to start a multi-contract analysis.
              </p>
              <Link href="/dashboard" className="inline-block pt-2">
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-xs">
                  Go to Dashboard
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map((doc) => {
                  const isChecked = selectedDocIds.includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => toggleDocument(doc.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 ${
                        isChecked
                          ? 'bg-indigo-950/30 border-indigo-500/60 ring-1 ring-indigo-500/30 shadow-md shadow-indigo-500/10'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                      }`}
                    >
                      <div className="pt-0.5 shrink-0 text-indigo-400">
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-indigo-400" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-600" />
                        )}
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-200 truncate">
                            {doc.title || doc.fileName}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 shrink-0 font-medium">
                            {doc.pageCount || 1} pg
                          </span>
                        </div>

                        <p className="text-[11px] text-slate-400 truncate mt-0.5">{doc.fileName}</p>

                        <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-indigo-400" />
                            {doc._count?.chunks ?? (doc as any).chunks?.length ?? 0} chunks indexed
                          </span>
                          <span>•</span>
                          <span className="text-emerald-400 font-medium flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Sticky Action Bar */}
              <div className="sticky bottom-6 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    {selectedDocIds.length}
                  </span>
                  <span className="text-xs text-slate-300 font-medium">
                    {selectedDocIds.length === 1
                      ? '1 contract selected'
                      : `${selectedDocIds.length} contracts selected for comparative analysis`}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => setIsChatActive(true)}
                    disabled={selectedDocIds.length === 0}
                    className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs h-9 px-5 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 transition-all font-semibold"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Start Multi-Contract Chat ({selectedDocIds.length})</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Active Multi-Document Chat View (Requirement 20)
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 overflow-hidden">
      {/* Decorative Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-0 right-1/3 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Bar */}
      <header className="shrink-0 h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3 overflow-hidden">
          <button
            onClick={() => setIsChatActive(false)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-colors"
            title="Change Document Selection"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Multi-Contract Synthesis</span>
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {selectedDocIds.length} Contracts Active
              </span>
            </div>

            {/* Selected Contracts Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-lg scrollbar-none">
              {selectedDocIds.map((docId) => (
                <span
                  key={docId}
                  className="inline-flex items-center gap-1 px-2 py-0.2 rounded-md bg-slate-900 border border-slate-800 text-[10px] text-slate-300 truncate"
                  title={documentTitlesMap[docId]}
                >
                  <FileText className="w-2.5 h-2.5 text-indigo-400" />
                  <span className="truncate max-w-[120px]">{documentTitlesMap[docId]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsChatActive(false)}
            className="text-xs h-8 px-3 border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Modify Contracts</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (isGenerating) handleStop();
              setMessages([]);
              setConversationId(null);
            }}
            className="text-xs h-8 px-3 text-slate-400 hover:text-slate-200"
            title="Reset Chat"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">New Chat</span>
          </Button>
        </div>
      </header>

      {/* Main Messages Area */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.length === 0 ? (
            /* Multi-Doc Empty State */
            <div className="py-12 sm:py-20 text-center max-w-xl mx-auto space-y-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center mx-auto text-indigo-400 shadow-xl shadow-indigo-500/10">
                <Layers className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-slate-100">
                  Cross-Document Legal Synthesis
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                  Ask questions that span across your{' '}
                  <strong className="text-indigo-300 font-semibold">{selectedDocIds.length} selected contracts</strong>.
                  Each quote is verified against its own document and links directly to its source.
                </p>
              </div>

              {/* Suggestions */}
              <div className="space-y-2 pt-2 text-left">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-center">
                  Suggested Comparative Questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MULTI_DOC_SUGGESTIONS.map((prompt, i) => (
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
            /* Messages */
            messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                documentTitles={documentTitlesMap}
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

        {/* Input Bar */}
        <div className="shrink-0 border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-xl p-4">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="relative flex items-end gap-2 bg-slate-900/90 border border-slate-800 focus-within:border-indigo-500/60 rounded-2xl p-2 transition-all shadow-xl">
              <textarea
                ref={textareaRef}
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a comparative question across the selected contracts... (Enter to send, Shift+Enter for new line)"
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
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-xs h-9 px-3.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 transition-all font-semibold"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Compare</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>Comparing across {selectedDocIds.length} selected contracts</span>
              <span>Press Enter to send</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MultiDocumentChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mr-2" />
          Loading contract analysis...
        </div>
      }
    >
      <MultiDocumentChatContent />
    </Suspense>
  );
}
