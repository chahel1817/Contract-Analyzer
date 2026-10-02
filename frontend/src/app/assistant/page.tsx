'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AnnaAssistant from '@/components/AnnaAssistant';

function AssistantPageContent() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get('docId') || undefined;

  return (
    <div className="w-full min-h-screen bg-[#fafaf9] text-neutral-900 font-sans selection:bg-amber-500/20 selection:text-amber-900 overflow-x-hidden">
      <AnnaAssistant initialDocumentId={initialDocId} />
    </div>
  );
}

export default function AssistantPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#fafaf9]">
          <div className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
        </div>
      }
    >
      <AssistantPageContent />
    </Suspense>
  );
}
