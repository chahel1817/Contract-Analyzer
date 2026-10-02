'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Comparison from '@/components/Comparison';
import { Scale, MessageSquare, GitCompare, LayoutDashboard, Sparkles } from 'lucide-react';

function CompareContent() {
  const searchParams = useSearchParams();
  const docAId = searchParams.get('docA') || searchParams.get('documentA') || undefined;
  const docBId = searchParams.get('docB') || searchParams.get('documentB') || undefined;

  return <Comparison initialDocAId={docAId} initialDocBId={docBId} />;
}

export default function ComparePage() {
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
                Comparison Engine
              </span>
            </div>
          </Link>

          <nav className="flex items-center space-x-1 sm:space-x-2">
            <Link
              href="/assistant"
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 text-white hover:bg-black transition flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>Talk to Anna</span>
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 rounded-xl text-xs font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 transition-colors flex items-center gap-1.5"
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
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
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-neutral-100 text-neutral-900 border border-neutral-200 transition-colors flex items-center gap-1.5"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense
          fallback={
            <div className="p-12 text-center text-neutral-400 text-sm">
              Loading contract comparison engine...
            </div>
          }
        >
          <CompareContent />
        </Suspense>
      </main>
    </div>
  );
}
