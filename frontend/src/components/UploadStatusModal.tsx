'use client';

import React from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Sparkles,
  FileText,
  ArrowRight,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentItem } from '@/lib/api';

export type UploadModalStatus = 'idle' | 'uploading' | 'success' | 'error';

interface UploadStatusModalProps {
  isOpen: boolean;
  status: UploadModalStatus;
  fileName?: string;
  fileSize?: number;
  errorMessage?: string | null;
  uploadedDoc?: DocumentItem | null;
  onClose: () => void;
  onAskQuestions: (doc?: DocumentItem | null) => void;
  onRetry?: () => void;
}

export default function UploadStatusModal({
  isOpen,
  status,
  fileName,
  fileSize,
  errorMessage,
  uploadedDoc,
  onClose,
  onAskQuestions,
  onRetry,
}: UploadStatusModalProps) {
  if (!isOpen || status === 'idle') return null;

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/45 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative max-w-sm w-full bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-neutral-100/90 text-center animate-in zoom-in-95 duration-200 overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Ambient Top Glow */}
        <div
          className={`absolute -top-16 left-1/2 -translate-x-1/2 w-48 h-24 rounded-full blur-2xl pointer-events-none transition-all ${
            status === 'success'
              ? 'bg-emerald-400/25'
              : status === 'error'
              ? 'bg-rose-400/25'
              : 'bg-amber-400/25'
          }`}
        />

        {/* Close Button (only when not uploading) */}
        {status !== 'uploading' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* ========================================================
            STATE 1: UPLOADING & EXTRACTING
            ======================================================== */}
        {status === 'uploading' && (
          <div className="space-y-4 pt-1">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-600 mx-auto relative">
              <UploadCloud className="w-7 h-7 text-amber-600" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white shadow-xs border border-amber-200 flex items-center justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
              </div>
            </div>

            <div className="space-y-1">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-amber-700 px-2.5 py-0.5 rounded-full bg-amber-100/70 border border-amber-200">
                Processing Document
              </span>
              <h3 className="text-base font-bold text-neutral-900">
                Uploading Contract...
              </h3>
              <p className="text-xs text-neutral-500">
                Extracting clauses, indexing text layers, and readying AI analysis.
              </p>
            </div>

            {/* File Info Chip */}
            {fileName && (
              <div className="p-2.5 rounded-xl bg-neutral-50 border border-neutral-200/80 flex items-center justify-center gap-2 text-xs text-neutral-700">
                <FileText className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                <span className="truncate max-w-[200px] font-semibold">{fileName}</span>
                {fileSize && (
                  <span className="text-[10px] text-neutral-400">
                    ({formatFileSize(fileSize)})
                  </span>
                )}
              </div>
            )}

            {/* Animated Progress Shimmer */}
            <div className="w-full bg-neutral-100 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-600 rounded-full animate-pulse w-3/4" />
            </div>

            <p className="text-[11px] text-neutral-400 italic">
              Usually takes only 3 to 6 seconds...
            </p>
          </div>
        )}

        {/* ========================================================
            STATE 2: SUCCESS
            ======================================================== */}
        {status === 'success' && (
          <div className="space-y-4 pt-1">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto shadow-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>

            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 px-2.5 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-200">
                <Sparkles className="w-3 h-3 text-emerald-600 fill-current" />
                Upload Complete
              </span>
              <h3 className="text-lg font-bold text-neutral-900">
                PDF Successfully Uploaded!
              </h3>
              <p className="text-xs text-neutral-600 leading-relaxed font-medium">
                PDF successfully uploaded, you can ask questions now.
              </p>
            </div>

            {/* Document Pill */}
            {(fileName || uploadedDoc?.title || uploadedDoc?.fileName) && (
              <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 flex items-center justify-center gap-2 text-xs text-emerald-900">
                <FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate max-w-[220px] font-semibold">
                  {uploadedDoc?.title || uploadedDoc?.fileName || fileName}
                </span>
              </div>
            )}

            {/* Primary Action Button */}
            <div className="pt-2 space-y-2">
              <Button
                onClick={() => onAskQuestions(uploadedDoc)}
                className="w-full h-11 bg-neutral-900 hover:bg-black text-white font-bold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer group"
              >
                <Sparkles className="w-4 h-4 text-amber-400 fill-current" />
                <span>Ask Questions Now</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>

              <button
                type="button"
                onClick={onClose}
                className="w-full text-xs text-neutral-500 hover:text-neutral-800 font-medium py-1 transition cursor-pointer"
              >
                Close & Stay Here
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STATE 3: ERROR
            ======================================================== */}
        {status === 'error' && (
          <div className="space-y-4 pt-1">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mx-auto">
              <AlertCircle className="w-8 h-8 text-rose-600" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-neutral-900">
                Upload Encountered an Issue
              </h3>
              <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200/80 rounded-xl p-2.5 leading-relaxed">
                {errorMessage || 'Failed to process document. Please ensure it is a valid PDF or DOCX file.'}
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              {onRetry && (
                <Button
                  onClick={onRetry}
                  className="flex-1 h-9 bg-neutral-900 hover:bg-black text-white text-xs font-semibold rounded-xl"
                >
                  Try Again
                </Button>
              )}
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1 h-9 border-neutral-200 text-xs font-semibold rounded-xl"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
