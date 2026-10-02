'use client';

import React, { useState } from 'react';
import { ChatMessage } from '@/lib/api';
import Citation from './Citation';
import {
  User,
  Bot,
  Copy,
  Check,
  Loader2,
  Sparkles,
  ShieldCheck,
  Search,
} from 'lucide-react';

export interface MessageProps {
  message: ChatMessage;
  onJumpToPage?: (pageNumber: number) => void;
  documentId?: string;
}

export default function Message({
  message,
  onJumpToPage,
  documentId,
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
      <div className="flex justify-end mb-6">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[75%] flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20 text-white">
            <User className="w-4 h-4" />
          </div>

          <div className="space-y-1">
            <div className="bg-indigo-600/90 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg shadow-indigo-600/10 text-sm leading-relaxed backdrop-blur-md">
              <p className="whitespace-pre-wrap select-text">{message.content}</p>
            </div>
            {message.createdAt && (
              <p className="text-[10px] text-slate-500 text-right pr-1">
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
    <div className="flex justify-start mb-6">
      <div className="flex items-start gap-3 max-w-[95%] sm:max-w-[88%] w-full">
        <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700/80 flex items-center justify-center shrink-0 shadow-md text-indigo-400">
          <Bot className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-3 min-w-0">
          {/* Main Bubble */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl rounded-tl-sm p-4 sm:p-5 backdrop-blur-xl shadow-lg relative group">
            {/* Top Bar / Status */}
            <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/60 text-xs">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span className="font-semibold text-slate-200 text-xs">Contract AI</span>
                {hasCitations && (
                  <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    {verifiedCount} Verified Quote{verifiedCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {message.createdAt && (
                  <span className="text-[10px] text-slate-500">
                    {formatTime(message.createdAt)}
                  </span>
                )}
                {message.content && !message.isStreaming && (
                  <button
                    onClick={handleCopy}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
                    title="Copy Answer"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* In-flight status banner */}
            {message.statusText && (
              <div className="mb-3 px-3 py-1.5 rounded-lg bg-indigo-950/40 border border-indigo-800/40 flex items-center gap-2 text-xs text-indigo-300 animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                <span>{message.statusText}</span>
              </div>
            )}

            {/* Answer Content */}
            <div className="prose prose-invert max-w-none text-slate-200 text-sm leading-relaxed whitespace-pre-wrap select-text">
              {message.content ? (
                message.content
              ) : (
                <div className="flex items-center gap-2 text-slate-400 italic py-1">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                  <span>Generating answer...</span>
                </div>
              )}

              {message.isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-indigo-400 animate-pulse align-middle" />
              )}
            </div>
          </div>

          {/* Verified Quote Cards */}
          {hasCitations && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Supporting Evidence & Verified Quotes
                </h4>
                <span className="text-[10px] text-slate-500">
                  {message.citations?.length} quote{message.citations?.length !== 1 ? 's' : ''} extracted
                </span>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {message.citations?.map((citation, idx) => (
                  <Citation
                    key={citation.id || `quote-${idx}`}
                    citation={citation}
                    onJumpToPage={onJumpToPage}
                    documentId={documentId}
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
