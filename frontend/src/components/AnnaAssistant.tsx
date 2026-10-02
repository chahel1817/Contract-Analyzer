'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Plus,
  Mic,
  MicOff,
  Send,
  Square,
  Sparkles,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  ChevronRight,
  RotateCcw,
  Sliders,
  Scale,
  ExternalLink,
  ShieldCheck,
  Check,
  LayoutDashboard,
  ArrowUpRight,
} from 'lucide-react';
import {
  fetchDocuments,
  uploadDocument,
  streamChatMessage,
  DocumentItem,
  ChatMessage,
  CitationItem,
} from '@/lib/api';

// Curated high-value prompts ("good text" for legal contract analysis)
const CURATED_PROMPTS = [
  {
    category: 'Risk & Liability',
    label: 'Analyze liability caps & indemnification',
    query: 'What are the liability caps, indemnification obligations, and exclusions in this agreement?',
    icon: '🛡️',
  },
  {
    category: 'Termination',
    label: 'Identify high-risk termination penalties',
    query: 'What are the termination conditions, cure periods, and penalty provisions upon breach?',
    icon: '⚡',
  },
  {
    category: 'Commercials',
    label: 'Summarize payment terms & billing schedules',
    query: 'What are the payment milestones, invoicing terms, due dates, and interest penalties?',
    icon: '📑',
  },
  {
    category: 'IP & Ownership',
    label: 'Audit IP assignment & non-compete clauses',
    query: 'Does the agreement assign intellectual property and are there non-compete or non-solicitation restrictions?',
    icon: '⚖️',
  },
  {
    category: 'Legal Venue',
    label: 'Extract governing law & dispute arbitration',
    query: 'What is the governing law, chosen jurisdiction, and required dispute resolution or arbitration venue?',
    icon: '🔍',
  },
];

interface AnnaAssistantProps {
  initialDocumentId?: string;
  className?: string;
}

export default function AnnaAssistant({ initialDocumentId, className = '' }: AnnaAssistantProps) {
  // Navigation & Drawer
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);

  // Documents & Selection
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(initialDocumentId ? [initialDocumentId] : []);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Voice Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // References
  const abortControllerRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load documents
  const loadDocs = async () => {
    try {
      setIsLoadingDocs(true);
      const res = await fetchDocuments();
      if (res.success && res.data) {
        const readyDocs = res.data.filter((d) => d.status === 'READY');
        setDocuments(readyDocs);
        if (!selectedDocIds.length && readyDocs.length > 0) {
          setSelectedDocIds([readyDocs[0].id]);
        }
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  // Web Speech API check
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        setSpeechSupported(true);
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
          setQuery(transcript);
        };

        recognition.onerror = (e: any) => {
          console.warn('Speech recognition error:', e);
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  const toggleListening = () => {
    if (!speechSupported || !recognitionRef.current) {
      alert('Speech recognition is not supported in this browser. Please type your query.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        console.error('Error starting recognition:', err);
      }
    }
  };

  // Scroll messages
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, statusText]);

  // Handle Send
  const handleSend = async (questionToSend?: string) => {
    const text = (questionToSend || query).trim();
    if (!text || isGenerating) return;

    if (selectedDocIds.length === 0 && documents.length > 0) {
      setSelectedDocIds([documents[0].id]);
    }

    setError(null);
    setQuery('');
    setIsGenerating(true);
    setStatusText('Lexi is thinking...');

    // Optimistically add user message
    const tempUserMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    // Placeholder assistant message
    const tempAssistantMsg: ChatMessage = {
      id: `asst-${Date.now()}`,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      isStreaming: true,
      citations: [],
    };

    setMessages((prev) => [...prev, tempUserMsg, tempAssistantMsg]);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    let accumulatedContent = '';

    try {
      await streamChatMessage({
        documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
        documentId: selectedDocIds.length === 1 ? selectedDocIds[0] : undefined,
        question: text,
        conversationId: conversationId || undefined,
        signal: controller.signal,
        onStatus: (status) => {
          setStatusText(status);
        },
        onDelta: (chunk) => {
          accumulatedContent += chunk;
          const currentText = accumulatedContent;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: currentText,
                isStreaming: true,
              },
            ];
          });
        },
        onDone: (data) => {
          if (data.conversationId) {
            setConversationId(data.conversationId);
          }
          const finalAnswer = data.answer && data.answer.trim().length > 0 ? data.answer : accumulatedContent;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (!last || last.role !== 'assistant') return prev;
            return [
              ...prev.slice(0, -1),
              {
                ...last,
                content: finalAnswer,
                citations: data.citations || [],
                isStreaming: false,
              },
            ];
          });
          setIsGenerating(false);
          setStatusText(null);
        },
        onError: (err) => {
          setError(err);
          setIsGenerating(false);
          setStatusText(null);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last && last.role === 'assistant' && !last.content) {
              last.content = `I encountered an issue: ${err}`;
              last.isStreaming = false;
            }
            return updated;
          });
        },
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Stream connection failed');
      }
      setIsGenerating(false);
      setStatusText(null);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      setStatusText(null);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.role === 'assistant') {
          last.isStreaming = false;
        }
        return updated;
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const res = await uploadDocument(file);
      if (res.success && res.data) {
        await loadDocs();
        setSelectedDocIds([res.data.id]);
        setIsPlusMenuOpen(false);
      } else {
        alert(res.error || 'Failed to upload document');
      }
    } catch (err: any) {
      alert(err.message || 'Upload error');
    } finally {
      setUploading(false);
    }
  };

  const selectedDocumentNames = documents
    .filter((d) => selectedDocIds.includes(d.id))
    .map((d) => d.title || d.fileName);

  const hasChat = messages.length > 0;

  return (
    <div
      className={`relative w-full h-screen max-h-screen overflow-hidden bg-[#fafaf9] text-neutral-900 font-sans flex flex-col justify-between selection:bg-amber-500/20 selection:text-amber-900 ${className}`}
    >
      {/* Top Header Bar */}
      <header className="w-full max-w-5xl mx-auto px-6 sm:px-10 pt-5 sm:pt-7 pb-2 flex items-center justify-between z-20 shrink-0">
        {/* Two-Bar Hamburger Button (Exact match from screenshot) */}
        <button
          onClick={() => setIsMenuOpen(true)}
          aria-label="Open menu"
          className="group flex flex-col justify-center items-start gap-[5px] w-9 h-9 p-1 rounded-lg hover:bg-neutral-200/60 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-5 h-[2px] bg-neutral-900 rounded-full transition-all group-hover:w-6" />
          <span className="w-5 h-[2px] bg-neutral-900 rounded-full transition-all group-hover:w-4" />
        </button>

        {/* Right Header Navigation & Document Indicator */}
        <div className="flex items-center space-x-2">
          {/* Active Document Tag */}
          {selectedDocumentNames.length > 0 && (
            <button
              onClick={() => setIsMenuOpen(true)}
              title={selectedDocumentNames.join(', ')}
              className="flex items-center space-x-1.5 px-3 py-1 text-[11px] sm:text-xs font-medium bg-neutral-100/90 text-neutral-700 rounded-full border border-neutral-200/80 hover:bg-neutral-200 transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-amber-500" />
              <span className="max-w-[120px] sm:max-w-[190px] truncate">{selectedDocumentNames[0]}</span>
              {selectedDocumentNames.length > 1 && (
                <span className="text-amber-600 font-bold">+{selectedDocumentNames.length - 1}</span>
              )}
            </button>
          )}

          {/* Quick link to Dashboard */}
          <Link
            href="/dashboard"
            className="hidden sm:flex items-center space-x-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 px-2.5 py-1 rounded-lg hover:bg-neutral-200/50 transition"
          >
            <span>Dashboard</span>
            <ArrowUpRight className="w-3 h-3 text-neutral-400" />
          </Link>

          {/* Reset / New Chat Button (visible in chat) */}
          {hasChat && (
            <button
              onClick={() => {
                setMessages([]);
                setConversationId(null);
              }}
              title="Start new conversation"
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200/60 transition cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Center Content Container */}
      <main className="flex-1 w-full max-w-lg sm:max-w-xl mx-auto px-6 flex flex-col justify-between py-2 overflow-hidden">
        {!hasChat ? (
          /* ========================================================
             Initial Hero State (Exact visual match to the image)
             ======================================================== */
          <div className="flex-1 flex flex-col justify-between my-auto py-2">
            {/* 1. Large Luminous Golden Anna Orb */}
            <div className="flex-1 flex items-center justify-center relative py-2">
              {/* Diffused Warm Halo Glow */}
              <div
                className={`absolute w-64 h-64 sm:w-72 sm:h-72 rounded-full bg-gradient-to-tr from-amber-400/25 via-yellow-300/35 to-amber-500/25 blur-3xl pointer-events-none transition-all duration-700 ${
                  isListening ? 'scale-125 opacity-90' : 'scale-100 opacity-60'
                }`}
              />

              {/* Pulsing Voice Wave Rings (Active when microphone is on) */}
              {isListening && (
                <>
                  <div className="absolute w-56 h-56 rounded-full border-2 border-amber-400/40 animate-voice-wave" />
                  <div
                    className="absolute w-64 h-64 rounded-full border-2 border-yellow-400/30 animate-voice-wave"
                    style={{ animationDelay: '0.6s' }}
                  />
                </>
              )}

              {/* Glowing 3D Orb Asset */}
              <div
                className={`relative w-[205px] h-[205px] sm:w-[245px] sm:h-[245px] rounded-full cursor-pointer select-none transition-transform duration-500 hover:scale-105 active:scale-95 ${
                  isGenerating ? 'animate-orb-thinking' : 'animate-orb-breathe'
                }`}
                onClick={() => inputRef.current?.focus()}
              >
                <Image
                  src="/anna-orb-hd.png"
                  alt="Lexi AI Assistant Orb"
                  width={260}
                  height={260}
                  priority
                  className="w-full h-full object-contain filter drop-shadow-[0_20px_40px_rgba(245,158,11,0.35)]"
                />
              </div>
            </div>

            {/* 2. Greeting & High-Impact Headline */}
            <div className="mt-auto mb-3 sm:mb-4 text-left">
              {/* General Legal AI Sub-greeting */}
              <p className="text-[14px] sm:text-[15px] font-medium text-neutral-500 tracking-normal flex items-center gap-1.5">
                <span>Contract Intelligence</span>
                <span className="text-neutral-300">•</span>
                <span className="text-amber-600 font-semibold">AI Legal Assistant</span>
              </p>

              {/* Bold 2-Line Headline (Exact line breaks and typography) */}
              <h1 className="text-[34px] sm:text-[42px] md:text-[46px] font-extrabold tracking-[-0.035em] text-neutral-900 leading-[1.06] mt-2">
                How can I help<br />
                you today?
              </h1>

              {/* Compact Horizontal Suggestions Row */}
              <div className="mt-3.5 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {CURATED_PROMPTS.slice(0, 3).map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt.query)}
                    className="shrink-0 text-left text-[11px] sm:text-xs bg-white/90 hover:bg-white text-neutral-700 px-3 py-1.5 rounded-full border border-neutral-200/90 shadow-2xs hover:shadow-xs transition flex items-center space-x-1.5 group cursor-pointer"
                  >
                    <span className="text-xs">{prompt.icon}</span>
                    <span className="font-medium group-hover:text-neutral-900 truncate max-w-[200px]">
                      {prompt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================
             Active Chat State (Light Mode Conversation)
             ======================================================== */
          <div className="flex-1 flex flex-col py-2 space-y-4">
            {/* Compact Persistent Anna Orb at Top */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-200/70 sticky top-0 bg-[#fafaf9]/95 backdrop-blur-md z-10">
              <div className="flex items-center space-x-3">
                <div
                  className={`relative w-10 h-10 rounded-full cursor-pointer ${
                    isGenerating ? 'animate-orb-thinking' : 'animate-orb-breathe'
                  }`}
                  onClick={() => {
                    setMessages([]);
                    setConversationId(null);
                  }}
                  title="Click to return to home view"
                >
                  <Image
                    src="/anna-orb-hd.png"
                    alt="Lexi AI Assistant Orb"
                    width={40}
                    height={40}
                    className="w-full h-full object-contain filter drop-shadow-[0_4px_10px_rgba(245,158,11,0.4)]"
                  />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-neutral-900">Lexi</h3>
                  <p className="text-[11px] text-neutral-500 flex items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block mr-1"></span>
                    {statusText || (isGenerating ? 'Analyzing contracts...' : 'Ready to assist')}
                  </p>
                </div>
              </div>

              {isGenerating && (
                <button
                  onClick={handleStop}
                  className="flex items-center space-x-1 text-xs px-3 py-1 bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded-full font-medium transition cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current text-rose-500" />
                  <span>Stop</span>
                </button>
              )}
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 space-y-4 overflow-y-auto max-h-[60vh] pr-1 assistant-scrollbar">
              {messages.map((msg, index) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id || index}
                    className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} transition-all`}
                  >
                    {/* Message Bubble */}
                    <div
                      className={`max-w-[90%] text-sm rounded-2xl px-4 py-3 leading-relaxed shadow-2xs ${
                        isUser
                          ? 'bg-neutral-900 text-white rounded-br-xs'
                          : 'bg-white text-neutral-900 border border-neutral-200/90 rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Streaming Indicator */}
                      {msg.isStreaming && !msg.content && (
                        <div className="flex items-center space-x-1.5 py-1 text-neutral-400 text-xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                          <span>{statusText || 'Lexi is reviewing contract clauses...'}</span>
                        </div>
                      )}
                    </div>

                    {/* Verified Citations List */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2.5 max-w-[95%] w-full space-y-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 flex items-center">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 mr-1" />
                          Verified Contract Excerpts ({msg.citations.length})
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {msg.citations.map((c, cIdx) => (
                            <div
                              key={c.id || cIdx}
                              className="p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl text-xs text-neutral-800 flex flex-col space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-200/60 text-amber-900">
                                  {c.pageStart ? `Page ${c.pageStart}` : 'Clause Match'}
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-700 flex items-center">
                                  <Check className="w-3 h-3 mr-0.5" /> 100% Verified
                                </span>
                              </div>
                              <blockquote className="italic text-neutral-700 text-xs border-l-2 border-amber-400 pl-2.5 my-1 leading-normal">
                                &ldquo;{c.quote}&rdquo;
                              </blockquote>
                              {c.documentId && (
                                <Link
                                  href={`/documents/${c.documentId}/chat`}
                                  className="text-[11px] text-amber-700 hover:text-amber-900 font-semibold flex items-center justify-end group mt-0.5"
                                >
                                  <span>View highlight in document viewer</span>
                                  <ChevronRight className="w-3.5 h-3.5 ml-0.5 group-hover:translate-x-0.5 transition" />
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="w-full mb-2 p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-700 animate-in fade-in shrink-0">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-rose-400 hover:text-rose-700 p-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 3. Bottom Floating Search / Input Pill (Exact replica from image) */}
        <div className="w-full pt-2 pb-5 sm:pb-8 relative shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative flex items-center"
          >
            {/* The Rounded Full Pill Container */}
            <div
              className={`w-full flex items-center rounded-full bg-[#f1f1f3] hover:bg-[#eaebee] focus-within:bg-white focus-within:ring-2 focus-within:ring-amber-400/50 focus-within:border-amber-300 border border-neutral-200/70 transition-all duration-200 py-3.5 px-4 shadow-[0_8px_30px_rgba(0,0,0,0.05)] ${
                isListening ? 'ring-2 ring-amber-400 bg-amber-50/60' : ''
              }`}
            >
              {/* Left Action: Plus (+) Button */}
              <button
                type="button"
                onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                className="text-neutral-400 hover:text-neutral-900 transition mr-2.5 p-1 rounded-full hover:bg-neutral-200/60 active:scale-90 cursor-pointer"
                aria-label="Add contract or options"
                title="Add contract or options"
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* Text Input (Placeholder "Search") */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isListening ? 'Listening to your voice...' : 'Search'}
                className="flex-1 bg-transparent border-0 outline-none text-neutral-900 placeholder:text-neutral-400 text-[15px] sm:text-[16px] font-normal"
              />

              {/* Right Action: Stop Button if Generating, Send Button if Text, or Microphone Button */}
              {isGenerating ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="ml-2 w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center hover:bg-rose-700 transition active:scale-95 cursor-pointer shadow-xs"
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>
              ) : query.trim().length > 0 ? (
                <button
                  type="submit"
                  className="ml-2 w-8 h-8 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-black transition active:scale-95 cursor-pointer"
                  aria-label="Submit search"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`ml-2 text-neutral-500 hover:text-neutral-900 transition p-1.5 rounded-full hover:bg-neutral-200/60 active:scale-90 cursor-pointer ${
                    isListening ? 'text-amber-600 bg-amber-100 animate-pulse' : ''
                  }`}
                  aria-label="Voice input"
                  title={speechSupported ? 'Speak with Lexi' : 'Voice input'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              )}
            </div>

            {/* Plus Action Popup Menu */}
            {isPlusMenuOpen && (
              <div className="absolute bottom-16 left-2 w-72 bg-white rounded-2xl shadow-xl border border-neutral-200 p-3 z-30 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                  <span className="text-xs font-bold text-neutral-800">Quick Actions</span>
                  <button
                    type="button"
                    onClick={() => setIsPlusMenuOpen(false)}
                    className="text-neutral-400 hover:text-neutral-600 p-0.5 rounded-md cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-2 space-y-1">
                  {/* Upload Contract */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg flex items-center space-x-2 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-500" />
                    <span>{uploading ? 'Uploading contract...' : 'Upload Contract (PDF/DOCX)'}</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={handleFileUpload}
                  />

                  {/* Switch to Comparison */}
                  <Link
                    href="/compare"
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg flex items-center space-x-2 transition"
                  >
                    <Scale className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Compare Two Contracts</span>
                  </Link>

                  {/* Select Target Document */}
                  <button
                    type="button"
                    onClick={() => {
                      setIsPlusMenuOpen(false);
                      setIsMenuOpen(true);
                    }}
                    className="w-full text-left px-2.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg flex items-center space-x-2 transition cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Select Target Contracts ({selectedDocIds.length} active)</span>
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </main>

      {/* Slide-Over Drawer (Triggered by the top-left 2-line menu icon) */}
      {isMenuOpen && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-xs z-50 flex animate-in fade-in duration-200">
          <div className="w-[85%] max-w-[340px] bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto assistant-scrollbar">
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-neutral-900">Lexi Assistant</h2>
                    <p className="text-[10px] text-neutral-400">Contracts & Settings</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMenuOpen(false)}
                  className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>


              {/* Document Selector */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                    Active Contracts
                  </label>
                  <span className="text-[10px] text-neutral-400 font-medium">
                    {selectedDocIds.length} selected
                  </span>
                </div>

                {isLoadingDocs ? (
                  <p className="text-xs text-neutral-400 italic">Loading contracts...</p>
                ) : documents.length === 0 ? (
                  <div className="text-xs text-neutral-500 bg-neutral-50 p-3 rounded-xl border border-dashed border-neutral-200">
                    No uploaded contracts found. Upload one below to start querying!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-52 overflow-y-auto assistant-scrollbar pr-1">
                    {documents.map((doc) => {
                      const isSelected = selectedDocIds.includes(doc.id);
                      return (
                        <div
                          key={doc.id}
                          onClick={() => {
                            setSelectedDocIds((prev) =>
                              prev.includes(doc.id)
                                ? prev.filter((id) => id !== doc.id)
                                : [...prev, doc.id]
                            );
                          }}
                          className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition ${
                            isSelected
                              ? 'bg-amber-50/70 border-amber-300 text-neutral-900 font-semibold'
                              : 'bg-neutral-50 border-neutral-200/80 text-neutral-600 hover:bg-neutral-100'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-amber-500' : 'text-neutral-400'}`} />
                            <span className="truncate max-w-[190px]">{doc.title || doc.fileName}</span>
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-amber-600" />}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Upload Button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-xs py-2 bg-neutral-900 text-white rounded-xl font-medium hover:bg-black transition flex items-center justify-center space-x-1.5 cursor-pointer mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Upload New Contract</span>
                </button>
              </div>

              {/* Navigation Links */}
              <div className="pt-2 border-t border-neutral-100 space-y-1">
                <Link
                  href="/dashboard"
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <LayoutDashboard className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Contract Dashboard</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/chat"
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Multi-Document Table Chat</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
                <Link
                  href="/compare"
                  className="w-full text-left px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center space-x-2">
                    <Scale className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Clause Comparison Tool</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-neutral-100 text-[11px] text-neutral-400 text-center">
              Contract Analyzer &bull; OpenRouter AI
            </div>
          </div>
          {/* Backdrop Click */}
          <div className="flex-1" onClick={() => setIsMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}
