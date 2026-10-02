'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CitationItem } from '@/lib/api';
import {
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Quote,
  FileSearch,
  Highlighter,
  FileText,
} from 'lucide-react';

export interface CitationProps {
  citation: CitationItem;
  onJumpToPage?: (pageNumber: number) => void;
  documentId?: string;
  documentTitle?: string;
  onSelectCitation?: (citation: CitationItem) => void;
  isSelected?: boolean;
}

export default function Citation({
  citation,
  onJumpToPage,
  documentId,
  documentTitle,
  onSelectCitation,
  isSelected = false,
}: CitationProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!citation.quote) return;
    navigator.clipboard.writeText(citation.quote);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isVerified = citation.verified;
  const pageNum = citation.pageStart || 1;
  const confidencePercent = citation.confidence
    ? Math.round(citation.confidence * 100)
    : 100;

  // Requirement 17: When user clicks Verified Quote, send documentId, startOffset, endOffset to viewer
  const handleClickCitation = () => {
    if (onSelectCitation) {
      onSelectCitation(citation);
      return;
    }

    const docId = documentId || citation.documentId;
    if (!docId) return;

    const params = new URLSearchParams();
    if (citation.quote) params.set('quote', citation.quote);
    if (citation.startOffset !== undefined && citation.startOffset !== null) {
      params.set('startOffset', String(citation.startOffset));
    }
    if (citation.endOffset !== undefined && citation.endOffset !== null) {
      params.set('endOffset', String(citation.endOffset));
    }
    if (citation.pageStart) {
      params.set('page', String(citation.pageStart));
    }
    if (citation.pageEnd) {
      params.set('pageEnd', String(citation.pageEnd));
    }

    router.push(`/documents/${docId}?${params.toString()}`);
  };

  return (
    <div
      onClick={handleClickCitation}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClickCitation();
        }
      }}
      className={`group relative rounded-xl border p-3.5 transition-all duration-200 text-xs cursor-pointer select-none ${
        isSelected
          ? 'bg-amber-500/10 border-amber-500/60 ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/10'
          : isVerified
          ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/60 hover:bg-slate-900/95 shadow-sm shadow-emerald-500/5'
          : 'bg-slate-900/80 border-rose-500/30 hover:border-rose-500/50 hover:bg-slate-900/95 shadow-sm shadow-rose-500/5'
      }`}
    >
      {/* Header with Verification Badge & Coordinates */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {documentTitle && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 truncate max-w-[130px]"
              title={documentTitle}
            >
              <FileText className="w-3 h-3 text-indigo-400 shrink-0" />
              <span className="truncate">{documentTitle}</span>
            </span>
          )}

          {isVerified ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              Unverified
            </span>
          )}

          {isVerified && (
            <span className="text-[10px] text-slate-400 font-medium">
              {confidencePercent}% match
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-slate-800/90 text-[10px] font-mono font-medium text-slate-300 border border-slate-700/60">
            Page {pageNum}
          </span>

          {citation.startOffset !== undefined && citation.startOffset !== null && (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-800/60 text-[9px] font-mono text-slate-400">
              Offset: [{citation.startOffset}..{citation.endOffset}]
            </span>
          )}

          <button
            onClick={handleCopy}
            title="Copy quote"
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Quote Body */}
      <div className="relative pl-3 border-l-2 border-slate-700/80 my-1.5">
        <Quote className="w-3.5 h-3.5 text-slate-600 absolute -left-2 -top-1.5 opacity-60" />
        <p className="text-slate-200 text-xs italic leading-relaxed select-text font-serif">
          &ldquo;{citation.quote}&rdquo;
        </p>
      </div>

      {/* Footer Actions */}
      <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span className="text-[10px] text-slate-500 flex items-center gap-1">
          <FileSearch className="w-3 h-3 text-indigo-400" />
          Verified against raw original contract
        </span>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-indigo-400 group-hover:text-indigo-300 transition-colors">
          <Highlighter className="w-3.5 h-3.5 text-amber-400" />
          <span>Click to view & highlight</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
