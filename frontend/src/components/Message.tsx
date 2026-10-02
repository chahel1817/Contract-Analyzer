'use client';

import React, { useState } from 'react';
import { ChatMessage, CitationItem } from '@/lib/api';
import Citation from './Citation';
import {
  User,
  Bot,
  Copy,
  Check,
  Loader2,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

export interface MessageProps {
  message: ChatMessage;
  onJumpToPage?: (pageNumber: number) => void;
  documentId?: string;
  documentTitles?: Record<string, string>;
  onSelectCitation?: (citation: CitationItem) => void;
  selectedCitationId?: string;
}

export default function Message({
  message,
  onJumpToPage,
  documentId,
  documentTitles,
  onSelectCitation,
  selectedCitationId,
}: MessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const hasCitations = message.citations && message.citations.length > 0;
  const verifiedCount =
    message.citations?.filter((c) => c.verified).length || 0;

  const handleCopy = () => {
    if (!message.content) return;
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  if (isUser) {
    return (
      <div className="flex justify-end mb-6 font-sans">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%] flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center shrink-0 shadow-xs text-white">
            <User className="w-4 h-4" />
          </div>

          <div className="space-y-1">
            <div className="bg-neutral-900 text-white rounded-2xl rounded-tr-xs px-4 py-3 shadow-xs text-sm leading-relaxed">
              <p className="whitespace-pre-wrap select-text">{message.content}</p>
            </div>
            {message.createdAt && (
              <p className="text-[10px] text-neutral-400 text-right pr-1">
                {formatTime(message.createdAt)}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Assistant Message
  return (
    <div className="flex justify-start mb-6 font-sans">
      <div className="flex items-start gap-3 max-w-[95%] sm:max-w-[88%] w-full">
        <div className="w-8 h-8 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 shadow-2xs text-amber-600">
          <Bot className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          {/* Main Bubble */}
          <div className="bg-white border border-neutral-200/90 rounded-2xl rounded-tl-xs p-4 sm:p-5 shadow-2xs relative group">
            {/* Top Bar / Status */}
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-neutral-100 text-xs">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-current" />
                <span className="font-bold text-neutral-900 text-xs">Contract AI</span>
                {hasCitations && (
                  <span className="inline-flex items-center gap-1 ml-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    {verifiedCount} Verified Quote{verifiedCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {message.createdAt && (
                  <span className="text-[10px] text-neutral-400">
                    {formatTime(message.createdAt)}
                  </span>
                )}
                {message.content && !message.isStreaming && (
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
                    title="Copy Answer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* In-flight status banner */}
            {message.statusText && (
              <div className="mb-3 px-3 py-1.5 rounded-xl bg-amber-50/80 border border-amber-200/80 flex items-center gap-2 text-xs text-amber-900 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                <span className="font-medium">{message.statusText}</span>
              </div>
            )}

            {/* Answer Content */}
            <div className="text-neutral-800 text-sm leading-relaxed whitespace-pre-wrap select-text">
              {message.content ? (
                message.content
              ) : (
                <div className="flex items-center gap-2 text-neutral-400 italic py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Generating answer...</span>
                </div>
              )}

              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
              )}
            </div>
          </div>

          {/* Verified Quote Cards */}
          {hasCitations && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[11px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Supporting Evidence & Verified Quotes
                </h4>
                <span className="text-[10px] text-neutral-400">
                  {message.citations?.length} quote{message.citations?.length !== 1 ? 's' : ''} extracted
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {message.citations?.map((citation, idx) => (
                  <Citation
                    key={citation.id || `quote-${idx}`}
                    citation={citation}
                    onJumpToPage={onJumpToPage}
                    documentId={citation.documentId || documentId}
                    documentTitle={documentTitles?.[citation.documentId || '']}
                    onSelectCitation={onSelectCitation}
                    isSelected={selectedCitationId === citation.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
