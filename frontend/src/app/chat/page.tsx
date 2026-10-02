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
  ShieldCheck,
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

  const documentTitlesMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    documents.forEach((d) => {
      map[d.id] = d.title || d.fileName;
    });
    return map;
  }, [documents]);

  const handleSendMessage = async (textOverride?: string) => {
    const text = (textOverride || inputQuery).trim();
    if (!text || isGenerating) return;
    if (selectedDocIds.length === 0) {
      setError('Please select at least one contract to query.');
      return;
    }

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
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.statusText = status;
            }
            return updated;
          });
        },
        onDelta: (chunk) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.content = (last.content || '') + chunk;
              last.isStreaming = true;
            }
            return updated;
          });
        },
        onDone: (data) => {
          if (data.conversationId) {
            setConversationId(data.conversationId);
          }

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.isStreaming = false;
              last.statusText = undefined;
              last.citations = data.citations || [];
              if (data.answer && (!last.content || last.content.length < 5)) {
                last.content = data.answer;
              }
            }
            return updated;
          });

          setIsGenerating(false);
          abortControllerRef.current = null;
        },
        onError: (err) => {
          setError(err);
          setIsGenerating(false);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant') {
              last.isStreaming = false;
              last.statusText = undefined;
              if (!last.content) {
                last.content = `Error: ${err}`;
              }
            }
            return updated;
          });
          abortControllerRef.current = null;
        },
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to complete comparative chat.');
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
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          last.isStreaming = false;
          last.statusText = undefined;
        }
        return updated;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Selection mode
  if (!isChatActive) {
    return (
      <div className="min-h-screen bg-[#fafaf9] text-neutral-900 font-sans p-6 sm:p-12 selection:bg-amber-500/20">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200">
            <div className="flex items-center space-x-3">
              <Link
                href="/dashboard"
                className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500 fill-current" />
                  Multi-Contract Q&A & Analysis
                </h1>
                <p className="text-xs text-neutral-500 mt-1">
                  Select multiple contracts below to compare provisions, cross-reference clauses, and verify citations across all documents.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/assistant"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-black text-white text-xs font-bold shadow-xs transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-current" />
                <span>Anna Assistant</span>
              </Link>
              {documents.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={selectAll}
                    className="text-xs h-8 border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 cursor-pointer"
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={deselectAll}
                    className="text-xs h-8 text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  >
                    Clear
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Document Checklist */}
          {loading ? (
            <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs text-neutral-400">Loading contracts for selection...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 rounded-3xl bg-white border border-neutral-200 text-center space-y-3 shadow-2xs">
              <FileText className="w-10 h-10 text-neutral-300 mx-auto" />
              <h3 className="text-sm font-bold text-neutral-800">No Ready Contracts</h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                Please upload contracts on the dashboard to start a multi-contract analysis.
              </p>
              <Link href="/dashboard" className="inline-block pt-2">
                <Button size="sm" className="bg-neutral-900 hover:bg-black text-white text-xs cursor-pointer">
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
                      className={`p-4 rounded-2xl border transition-all cursor-pointer select-none flex items-start gap-3.5 shadow-2xs ${
                        isChecked
                          ? 'bg-amber-50/50 border-amber-400 ring-2 ring-amber-400/30'
                          : 'bg-white border-neutral-200/90 hover:border-neutral-300 hover:bg-neutral-50/50'
                      }`}
                    >
                      <div className="pt-0.5 shrink-0">
                        {isChecked ? (
                          <CheckSquare className="w-5 h-5 text-amber-600" />
                        ) : (
                          <Square className="w-5 h-5 text-neutral-400" />
                        )}
                      </div>

                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-neutral-900 truncate">
                            {doc.title || doc.fileName}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 shrink-0 font-medium">
                            {doc.pageCount || 1} pg
                          </span>
                        </div>

                        <p className="text-[11px] text-neutral-400 truncate mt-0.5">{doc.fileName}</p>

                        <div className="flex items-center gap-2 mt-2 text-[10px] text-neutral-500">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-amber-500" />
                            {doc._count?.chunks ?? (doc as any).chunks?.length ?? 0} chunks indexed
                          </span>
                          <span>&bull;</span>
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Ready
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Action Bar */}
              <div className="sticky bottom-6 p-4 rounded-2xl bg-white/90 border border-neutral-200/90 backdrop-blur-xl shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-amber-500/15 text-amber-800 flex items-center justify-center font-bold text-xs">
                    {selectedDocIds.length}
                  </span>
                  <span className="text-xs text-neutral-700 font-medium">
                    {selectedDocIds.length === 1
                      ? '1 contract selected'
                      : `${selectedDocIds.length} contracts selected for comparative analysis`}
                  </span>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    onClick={() => setIsChatActive(true)}
                    disabled={selectedDocIds.length === 0}
                    className="w-full sm:w-auto bg-neutral-900 hover:bg-black disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-xs h-9 px-5 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all font-semibold cursor-pointer"
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

  // Active Multi-Document Chat View
  return (
    <div className="flex flex-col h-screen bg-[#fafaf9] text-neutral-900 font-sans selection:bg-amber-500/20 overflow-hidden">
      {/* Top Bar */}
      <header className="shrink-0 h-16 border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between z-30">
        <div className="flex items-center space-x-3 overflow-hidden">
          <button
            onClick={() => setIsChatActive(false)}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 border border-transparent hover:border-neutral-200 transition-colors cursor-pointer"
            title="Change Document Selection"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="overflow-hidden">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-neutral-900 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500 fill-current shrink-0" />
                <span>Multi-Contract Synthesis</span>
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                {selectedDocIds.length} Contracts Active
              </span>
            </div>

            {/* Selected Contracts Badges */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 max-w-lg scrollbar-none">
              {selectedDocIds.map((docId) => (
                <span
                  key={docId}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neutral-100 border border-neutral-200 text-[10px] text-neutral-700 truncate"
                  title={documentTitlesMap[docId]}
                >
                  <FileText className="w-2.5 h-2.5 text-amber-500" />
                  <span className="truncate max-w-[120px]">{documentTitlesMap[docId]}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Link
            href="/assistant"
            className="text-xs h-8 px-3 rounded-xl bg-neutral-900 hover:bg-black text-white flex items-center gap-1.5 font-bold transition shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span className="hidden sm:inline">Anna Assistant</span>
          </Link>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsChatActive(false)}
            className="text-xs h-8 px-3 border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 flex items-center gap-1.5 cursor-pointer"
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
            className="text-xs h-8 px-3 text-neutral-500 hover:text-neutral-900 cursor-pointer"
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
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-600 shadow-sm">
                <Layers className="w-7 h-7" />
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-bold text-neutral-900">
                  Cross-Document Legal Synthesis
                </h3>
                <p className="text-xs text-neutral-500 leading-relaxed max-w-md mx-auto">
                  Ask questions that span across your{' '}
                  <strong className="text-neutral-900 font-bold">{selectedDocIds.length} selected contracts</strong>.
                  Each quote is verified against its own document and links directly to its source.
                </p>
              </div>

              {/* Suggestions */}
              <div className="space-y-2 pt-2 text-left">
                <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider text-center">
                  Suggested Comparative Questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {MULTI_DOC_SUGGESTIONS.map((prompt, i) => (
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
            <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div className="shrink-0 border-t border-neutral-200/80 bg-white/80 backdrop-blur-xl p-4">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="relative flex items-end gap-2 bg-[#f1f1f3] border border-neutral-200/80 focus-within:border-amber-400/80 focus-within:bg-white rounded-2xl p-2 transition-all shadow-xs">
              <textarea
                ref={textareaRef}
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask a comparative question across the selected contracts... (Enter to send, Shift+Enter for new line)"
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
                    <span className="hidden sm:inline">Compare</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-neutral-400 px-1">
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
        <div className="min-h-screen bg-[#fafaf9] flex items-center justify-center text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mr-2" />
          <span>Loading multi-contract chat...</span>
        </div>
      }
    >
      <MultiDocumentChatContent />
    </Suspense>
  );
}
