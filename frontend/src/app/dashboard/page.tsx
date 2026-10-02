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

  // Polling mechanism if any document is currently in PROCESSING status
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
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Background Decorative Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[128px]" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight bg-gradient-to-r from-slate-100 via-indigo-200 to-indigo-400 bg-clip-text text-transparent">
                Contract Analyzer
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                AI Legal Tech
              </span>
            </div>
          </div>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            <Link
              href="/assistant"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 fill-current" />
              Anna AI
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/80 text-indigo-300 border border-slate-700/60 transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/chat"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </Link>
            <Link
              href="/compare"
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Anna AI Feature Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/20 p-6 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-5">
            <div className="relative w-16 h-16 shrink-0 rounded-full animate-orb-breathe">
              <img
                src="/anna-orb-clean.png"
                alt="Anna AI Assistant Orb"
                className="w-full h-full object-contain filter drop-shadow-[0_8px_20px_rgba(245,158,11,0.5)]"
              />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full mb-1">
                <Sparkles className="w-3 h-3" />
                <span>Next-Gen Interaction Model</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Meet Anna — Your AI Contract Assistant
              </h2>
              <p className="text-xs text-slate-300 mt-1 max-w-xl">
                Experience the new minimalist LLM model interaction with voice dictation, radiant orb visuals, and 100% verified citations.
              </p>
            </div>
          </div>
          <Link
            href="/assistant"
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-300 hover:to-yellow-300 text-slate-950 font-bold text-xs tracking-wide shadow-lg shadow-amber-500/25 flex items-center gap-2 transition active:scale-95 shrink-0"
          >
            <span>Launch Anna Assistant</span>
            <Sparkles className="w-3.5 h-3.5 fill-current" />
          </Link>
        </div>

        {/* Welcome & Stats Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              Document Library
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Upload legal agreements to extract text, index clauses, and chat with 100% verified citations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white text-xs h-9 px-3 rounded-xl flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">Total Contracts</span>
              <FileText className="w-4 h-4 text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-slate-100">{totalDocs}</p>
          </div>

          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">Ready for Q&A</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-bold text-emerald-400">{readyDocs}</p>
          </div>

          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">Processing</span>
              <Clock className="w-4 h-4 text-blue-400" />
            </div>
            <p className="text-2xl font-bold text-blue-400">{processingDocs}</p>
          </div>

          <div className="p-4 bg-slate-900/50 border border-slate-800/80 rounded-2xl">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-xs font-medium">Failed / Scanned</span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <p className="text-2xl font-bold text-rose-400">{failedDocs}</p>
          </div>
        </div>

        {/* Upload Section */}
        <DocumentUpload onUploadSuccess={() => loadDocuments()} />

        {/* Document List Section */}
        <DocumentList
          documents={documents}
          isLoading={isLoading}
          onDocumentDeleted={() => loadDocuments()}
          onRefresh={loadDocuments}
        />
      </main>
    </div>
  );
}
