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
      className={`group relative rounded-2xl border p-3.5 transition-all duration-200 text-xs cursor-pointer select-none font-sans ${
        isSelected
          ? 'bg-amber-100/70 border-amber-500 ring-2 ring-amber-400/40 shadow-md'
          : isVerified
          ? 'bg-amber-50/50 border-amber-200/80 hover:border-amber-300 hover:bg-amber-50/80 shadow-2xs'
          : 'bg-rose-50/50 border-rose-200 hover:border-rose-300 shadow-2xs'
      }`}
    >
      {/* Header with Verification Badge & Coordinates */}
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-amber-200/50">
        <div className="flex items-center gap-2">
          {documentTitle && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-white text-neutral-700 border border-neutral-200 truncate max-w-[140px]"
              title={documentTitle}
            >
              <FileText className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">{documentTitle}</span>
            </span>
          )}

          {isVerified ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <CheckCircle2 className="w-3 h-3 text-emerald-700" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
              <AlertTriangle className="w-3 h-3 text-rose-600" />
              Unverified
            </span>
          )}

          {isVerified && (
            <span className="text-[10px] text-neutral-500 font-semibold">
              {confidencePercent}% match
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md bg-white text-[10px] font-mono font-bold text-neutral-800 border border-neutral-200 shadow-2xs">
            Page {pageNum}
          </span>

          {citation.startOffset !== undefined && citation.startOffset !== null && (
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-neutral-100 text-[9px] font-mono text-neutral-500">
              Offset: [{citation.startOffset}..{citation.endOffset}]
            </span>
          )}

          <button
            onClick={handleCopy}
            title="Copy quote"
            className="p-1 rounded text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-600" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Quote Body */}
      <div className="relative pl-3 border-l-2 border-amber-400 my-1.5">
        <Quote className="w-3.5 h-3.5 text-amber-500 absolute -left-2 -top-1.5 opacity-60" />
        <p className="text-neutral-900 text-xs italic leading-relaxed select-text font-serif">
          &ldquo;{citation.quote}&rdquo;
        </p>
      </div>

      {/* Footer Actions */}
      <div className="mt-2.5 pt-2 flex items-center justify-between text-[11px] text-neutral-500">
        <span className="text-[10px] text-neutral-400 flex items-center gap-1">
          <FileSearch className="w-3 h-3 text-amber-600" />
          Verified against raw original contract
        </span>

        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 group-hover:text-amber-900 transition-colors">
          <Highlighter className="w-3.5 h-3.5 text-amber-500" />
          <span>Click to view & highlight</span>
          <ExternalLink className="w-3 h-3" />
        </div>
      </div>
    </div>
  );
}
