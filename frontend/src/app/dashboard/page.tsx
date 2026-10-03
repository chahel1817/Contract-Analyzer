'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchDocuments, DocumentItem } from '@/lib/api';
import DocumentUpload from '@/components/DocumentUpload';
import DocumentList from '@/components/DocumentList';
import {
  FileText,
  MessageSquare,
  GitCompare,
  Layers,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  Scale,
  Sparkles,
  ArrowRight,
  UploadCloud,
  FileCheck,
  Check,
  Bot,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DashboardPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetchDocuments();
      if (res.success && Array.isArray(res.data)) {
        setDocuments(res.data);
      }
    } catch (e) {
      console.error('Failed to load documents', e);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Polling if any document is processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status?.toUpperCase() === 'PROCESSING');
    if (!hasProcessing) return;

    const interval = setInterval(() => {
      loadDocuments();
    }, 3000);

    return () => clearInterval(interval);
  }, [documents, loadDocuments]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadDocuments();
  };

  const totalDocs = documents.length;
  const readyDocs = documents.filter((d) => d.status?.toUpperCase() === 'READY').length;
  const processingDocs = documents.filter((d) => d.status?.toUpperCase() === 'PROCESSING').length;
  const failedDocs = documents.filter((d) => d.status?.toUpperCase() === 'FAILED').length;

  return (
    <div className="min-h-screen bg-[#fafaf9] text-neutral-900 font-sans selection:bg-amber-500/20 selection:text-amber-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-md shadow-amber-500/20">
              <Scale className="w-5 h-5 text-neutral-950 font-bold" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-neutral-900">
                Contract Analyzer
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                AI Legal Tech
              </span>
            </div>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            <Link
              href="/assistant"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 text-white hover:bg-black transition flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>Talk to Lexi</span>
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-200 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/chat"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </Link>
            <Link
              href="/compare"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare
            </Link>
            <Link
              href="/agent"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5 text-amber-600" />
              Part C Agent
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* ========================================================
            HERO CARD: Big "Talk to Analyzer" Button & PDF Guidance
            ======================================================== */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-white via-[#fffdf9] to-[#fefcf3] border border-amber-200/80 p-8 sm:p-10 shadow-sm">
          {/* Ambient Background Warm Glow */}
          <div className="absolute -top-24 -right-24 w-96 h-96 bg-amber-400/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
            <div className="space-y-4 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-100/80 text-amber-800 text-xs font-bold border border-amber-200/90">
                <Sparkles className="w-3.5 h-3.5 text-amber-600 fill-current" />
                <span>Next-Gen Interaction Model</span>
              </div>

              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-neutral-900 leading-[1.12]">
                Instant Legal Analysis with 100% Verified Citations
              </h1>

              <p className="text-sm sm:text-base text-neutral-600 leading-relaxed">
                Upload agreements to index text layers, extract clauses with page coordinates, and talk directly to the AI model. Every answer is anchored to verified contract quotes.
              </p>

              {/* Big Action Button */}
              <div className="pt-2 flex flex-wrap items-center gap-4">
                <Link
                  href="/assistant"
                  className="inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl bg-neutral-900 hover:bg-black text-white font-bold text-base sm:text-lg shadow-xl shadow-black/10 hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all group"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4.5 h-4.5 text-neutral-950 fill-current" />
                  </div>
                  <span>Talk to Analyzer</span>
                  <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1.5 transition-transform" />
                </Link>

                <Link
                  href="/compare"
                  className="inline-flex items-center gap-2 px-5 py-4 rounded-2xl bg-white hover:bg-neutral-100 text-neutral-700 font-semibold text-sm border border-neutral-200/90 shadow-2xs hover:shadow-xs transition"
                >
                  <GitCompare className="w-4 h-4 text-neutral-500" />
                  <span>Compare Agreements</span>
                </Link>
              </div>
            </div>

            {/* Glowing Orb Visual */}
            <div className="flex flex-col items-center justify-center lg:pr-6">
              <Link href="/assistant" className="group block relative">
                <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full animate-orb-breathe cursor-pointer">
                  <img
                    src="/anna-orb-hd.png"
                    alt="Lexi AI Assistant Orb"
                    className="w-full h-full object-contain filter drop-shadow-[0_15px_30px_rgba(245,158,11,0.4)] group-hover:scale-105 transition-transform"
                  />
                </div>
                <p className="text-center text-xs font-semibold text-neutral-500 group-hover:text-amber-600 transition mt-2">
                  Click orb to chat &rarr;
                </p>
              </Link>
            </div>
          </div>

          {/* Details for Uploading PDF and Processing */}
          <div className="mt-8 pt-6 border-t border-amber-200/60 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/80 rounded-2xl border border-neutral-200/70 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <UploadCloud className="w-3.5 h-3.5" />
                </div>
                <span>1. Supported PDF & DOCX</span>
              </div>
              <p className="text-[12px] text-neutral-500 leading-normal">
                Upload native or OCR contracts up to 50MB. Text layers and page boundaries are indexed deterministically.
              </p>
            </div>

            <div className="p-4 bg-white/80 rounded-2xl border border-neutral-200/70 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs">
                <div className="w-6 h-6 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <span>2. Sliding-Window Chunking</span>
              </div>
              <p className="text-[12px] text-neutral-500 leading-normal">
                Handles large 100–150+ page agreements. Splits contracts into semantic chunks for fast context retrieval.
              </p>
            </div>

            <div className="p-4 bg-white/80 rounded-2xl border border-neutral-200/70 shadow-2xs space-y-1">
              <div className="flex items-center gap-2 text-neutral-900 font-bold text-xs">
                <div className="w-6 h-6 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <Check className="w-3.5 h-3.5" />
                </div>
                <span>3. 100% Quote Verification</span>
              </div>
              <p className="text-[12px] text-neutral-500 leading-normal">
                Every extracted quote is verified against source text. Click any citation to view the exact page highlight.
              </p>
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div>
          <DocumentUpload onUploadSuccess={() => loadDocuments()} />
        </div>

        {/* Stats Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-neutral-700" />
              Contract Library
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Manage uploaded agreements, inspect clause indexing, and jump into analysis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-neutral-200 bg-white hover:bg-neutral-100 text-neutral-700 text-xs h-9 px-3 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards in White Mode */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-semibold">Total Contracts</span>
              <FileText className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-neutral-900">{totalDocs}</p>
          </div>

          <div className="p-4 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-semibold">Ready for Chat</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold text-emerald-600">{readyDocs}</p>
          </div>

          <div className="p-4 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-semibold">Processing</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-bold text-amber-600">{processingDocs}</p>
          </div>

          <div className="p-4 bg-white border border-neutral-200/80 rounded-2xl shadow-2xs">
            <div className="flex items-center justify-between text-neutral-500 mb-1">
              <span className="text-xs font-semibold">Failed</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-2xl font-bold text-rose-600">{failedDocs}</p>
          </div>
        </div>

        {/* Document List */}
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          onDocumentDeleted={() => loadDocuments()}
          onRefresh={loadDocuments}
        />
      </main>

      {/* Footer */}
      <footer className="mt-16 py-6 border-t border-neutral-200/80 bg-white/60 text-center text-xs text-neutral-400">
        Contract Analyzer &bull; White Mode Legal Tech &bull; OpenRouter AI
      </footer>
    </div>
  );
}
