'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AgentResearchView from '@/components/AgentResearchView';
import { Scale, MessageSquare, GitCompare, LayoutDashboard, Sparkles, Bot } from 'lucide-react';

function AgentPageContent() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get('docId') || undefined;

  return <AgentResearchView initialDocumentId={initialDocId} />;
}

export default function AgentPage() {
  return (
    <div className="min-h-screen bg-[#fafaf9] text-neutral-900 font-sans selection:bg-amber-500/20 selection:text-amber-900">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 w-full border-b border-neutral-200/80 bg-white/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 flex items-center justify-center shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Scale className="w-5 h-5 text-neutral-950 font-bold" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-neutral-900">
                Contract Analyzer
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/20">
                Part C Agent
              </span>
            </div>
          </Link>

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
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </Link>
            <Link
              href="/chat"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Chat</span>
            </Link>
            <Link
              href="/compare"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              <span>Compare</span>
            </Link>
            <Link
              href="/agent"
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-800 border border-amber-400/40 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Bot className="w-3.5 h-3.5 text-amber-700" />
              <span>Part C Agent</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Suspense
          fallback={
            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            </div>
          }
        >
          <AgentPageContent />
        </Suspense>
      </main>
    </div>
  );
}
