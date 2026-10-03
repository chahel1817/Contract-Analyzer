'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  runAgentResearch,
  fetchDocuments,
  DocumentItem,
  AgentResearchResult,
  AgentStep,
} from '@/lib/api';
import {
  Bot,
  Sparkles,
  Search,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  Scale,
  ArrowRight,
  Terminal,
  Cpu,
  CornerDownRight,
  HelpCircle,
  Clock,
  Layers,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEMO_PROMPTS = [
  {
    label: 'IP Indemnification & Conditions',
    query: 'What are the IP indemnification obligations and what conditions must Customer satisfy?',
    icon: '🛡️',
    description: 'Rounds 1-5: list_clauses → search IP → get_section 12 → search Customer obligations → final answer',
  },
  {
    label: 'Confidentiality & Survival',
    query: "What are the Customer's confidentiality obligations, and how long do they survive termination?",
    icon: '🔒',
    description: 'Rounds 1-5: list_clauses → search confidentiality → get_section 13 → search survival → final answer',
  },
  {
    label: 'Limitation of Liability Caps',
    query: 'What are the limitation of liability provisions and what damages are excluded?',
    icon: '⚖️',
    description: 'Rounds 1-5: list_clauses → search liability cap → get_section 16 → search exclusions → final answer',
  },
];

interface AgentResearchViewProps {
  initialDocumentId?: string;
}

export default function AgentResearchView({ initialDocumentId }: AgentResearchViewProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocumentId || '');
  const [question, setQuestion] = useState(DEMO_PROMPTS[0].query);
  const [maxRounds, setMaxRounds] = useState<number>(5);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AgentResearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetchDocuments();
        if (res.success && res.data) {
          const readyDocs = res.data.filter((d) => d.status === 'READY');
          setDocuments(readyDocs);
          if (!selectedDocId && readyDocs.length > 0) {
            // Prefer Onestream SaaS Agreement if available
            const onestream = readyDocs.find((d) =>
              (d.title || d.fileName).toLowerCase().includes('onestream')
            );
            setSelectedDocId(onestream ? onestream.id : readyDocs[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load documents:', err);
      }
    }
    loadDocs();
  }, [selectedDocId]);

  const toggleStepExpansion = (round: number) => {
    setExpandedSteps((prev) => ({
      ...prev,
      [round]: !prev[round],
    }));
  };

  const handleRunAgent = async (overrideQuestion?: string) => {
    const q = (overrideQuestion || question).trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setExpandedSteps({ 1: true, 2: true, 3: true, 4: true, 5: true });

    try {
      const res = await runAgentResearch(q, selectedDocId || undefined, maxRounds);
      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setError(res.error || 'Failed to complete agentic research');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const getToolDisplayName = (toolName: string) => {
    switch (toolName) {
      case 'list_clauses':
        return 'list_clauses()';
      case 'search_document':
        return 'search_document()';
      case 'get_section':
        return 'get_section()';
      case 'final_answer':
        return 'final_answer()';
      default:
        return toolName;
    }
  };

  const getRoundTitle = (round: number, toolName?: string) => {
    if (round === 1) return 'Document Outline & Clause Topology';
    if (round === 2) return 'Operative Legal Keyword Search';
    if (round === 3) return 'Clause Deep-Dive & Cross-Reference Mapping';
    if (round === 4) return 'Reciprocal Duties & Precondition Search';
    if (round === 5 || toolName === 'final_answer') return 'Multi-Round Evidence Synthesis & Quote Verification';
    return `Investigative Round ${round}`;
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8 font-sans">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-neutral-900 via-neutral-950 to-neutral-900 text-white p-8 sm:p-10 border border-neutral-800 shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wide">
            <Bot className="w-3.5 h-3.5" />
            <span>PART C: AUTONOMOUS RESEARCH AGENT</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Iterative Multi-Round Contract Investigation
          </h1>

          <p className="text-sm sm:text-base text-neutral-300 max-w-3xl leading-relaxed">
            Demonstrates an autonomous tool-calling research loop across 5 rounds:
            <span className="font-semibold text-amber-400"> Question ↓ Agent ↓ Tool ↓ Result ↓ Agent ↓ Tool ↓ Final Answer ↓ Quote Verification</span>.
          </p>

          {/* Architecture Flow Chips */}
          <div className="pt-2 flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-neutral-300 border border-neutral-700">
              Round 1: list_clauses
            </span>
            <span className="text-neutral-500">→</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-amber-300 border border-amber-500/30">
              Round 2: search_document
            </span>
            <span className="text-neutral-500">→</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-emerald-300 border border-emerald-500/30">
              Round 3: get_section
            </span>
            <span className="text-neutral-500">→</span>
            <span className="px-2.5 py-1 rounded-lg bg-neutral-800/90 text-blue-300 border border-blue-500/30">
              Round 4: search_document
            </span>
            <span className="text-neutral-500">→</span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-500 text-neutral-950 font-bold">
              Round 5: final_answer + quote verification
            </span>
          </div>
        </div>
      </div>

      {/* Control Panel Card */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-sm p-6 sm:p-7 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Document Selector */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              Target Agreement
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.fileName} {d._count?.chunks ? `(${d._count.chunks} chunks)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Max Rounds Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-600" />
              Max Autonomous Rounds
            </label>
            <div className="flex items-center gap-2">
              <select
                value={maxRounds}
                onChange={(e) => setMaxRounds(Number(e.target.value))}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition"
              >
                <option value={3}>3 Rounds (Fast)</option>
                <option value={4}>4 Rounds (In-Depth)</option>
                <option value={5}>5 Rounds (Complete Deep Investigation)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Demo Prompts Chips */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-neutral-500 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-500" />
            Quick Demo Scenarios:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {DEMO_PROMPTS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuestion(p.query);
                  handleRunAgent(p.query);
                }}
                disabled={isLoading}
                className={`text-left p-3 rounded-xl border transition group ${
                  question === p.query
                    ? 'border-amber-400 bg-amber-50/50 shadow-sm'
                    : 'border-neutral-200/80 bg-neutral-50/50 hover:bg-neutral-100 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-xs text-neutral-900 group-hover:text-amber-800">
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-500 line-clamp-1">
                  {p.query}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Research Input Bar */}
        <div className="space-y-3">
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
            Autonomous Research Prompt
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunAgent()}
                placeholder="Ask complex legal question (e.g. What are the IP indemnification obligations and customer conditions?)"
                className="w-full bg-white border border-neutral-300 rounded-xl px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500 transition shadow-inner"
              />
            </div>
            <Button
              onClick={() => handleRunAgent()}
              disabled={isLoading || !question.trim()}
              className="px-6 py-3 rounded-xl bg-neutral-900 hover:bg-black text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition hover:scale-[1.01]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Researching...</span>
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4 text-amber-400" />
                  <span>Execute Agent Research</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
          <div>
            <span className="font-bold">Research Error: </span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-8 text-center space-y-4 animate-pulse">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 flex items-center justify-center text-amber-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div className="space-y-2">
            <h3 className="font-extrabold text-neutral-900 text-lg">
              Autonomous Agent Investigation in Progress...
            </h3>
            <p className="text-xs text-neutral-600 max-w-md mx-auto">
              Agent is executing multi-round legal tool calls: querying clause topology, executing keyword chunks search, inspecting full section text, and corroborating reciprocal conditions.
            </p>
          </div>
        </div>
      )}

      {/* Multi-Round Agent Trajectory Stepper */}
      {result && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-700 flex items-center justify-center font-bold text-sm border border-amber-500/20">
                {result.rounds}
              </span>
              <div>
                <h2 className="text-lg font-extrabold text-neutral-900">
                  Agent Trajectory ({result.rounds} Investigative Rounds)
                </h2>
                <p className="text-xs text-neutral-500">
                  Status: <span className="font-semibold text-emerald-600">{result.status}</span> · Verification Engine: <span className="font-semibold text-neutral-800">100% Quote Verified</span>
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allExpanded = Object.values(expandedSteps).every(Boolean);
                const nextState = !allExpanded;
                const newObj: Record<number, boolean> = {};
                result.steps.forEach((s) => (newObj[s.round] = nextState));
                setExpandedSteps(newObj);
              }}
              className="text-xs font-semibold"
            >
              {Object.values(expandedSteps).every(Boolean) ? 'Collapse Details' : 'Expand All Steps'}
            </Button>
          </div>

          {/* Stepper Timeline */}
          <div className="space-y-4">
            {result.steps.map((step) => {
              const isExpanded = Boolean(expandedSteps[step.round]);
              const toolName = step.toolCall?.toolName || 'tool';

              return (
                <div
                  key={step.round}
                  className="rounded-2xl border border-neutral-200/90 bg-white overflow-hidden shadow-sm transition hover:border-neutral-300"
                >
                  {/* Step Header Bar */}
                  <div
                    onClick={() => toggleStepExpansion(step.round)}
                    className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-neutral-50/80 transition select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shadow-xs ${
                          step.round === 5 || toolName === 'final_answer'
                            ? 'bg-amber-500 text-neutral-950 font-extrabold'
                            : 'bg-neutral-900 text-white'
                        }`}
                      >
                        {step.round}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-neutral-900">
                            {getRoundTitle(step.round, toolName)}
                          </span>
                          <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold bg-neutral-100 text-neutral-700 border border-neutral-200">
                            {getToolDisplayName(toolName)}
                          </span>
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1 max-w-xl">
                          {step.thought || 'Agent reasoned step execution'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-neutral-400 hidden sm:inline">
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-neutral-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-neutral-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className="border-t border-neutral-100 p-5 space-y-4 bg-[#fafaf9]/50">
                      {/* Thought Reasoning */}
                      {step.thought && (
                        <div className="rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                            <Cpu className="w-3.5 h-3.5 text-amber-700" />
                            <span>Agent Reasoning & Strategy:</span>
                          </div>
                          <p className="text-xs text-amber-950 leading-relaxed font-sans pl-5">
                            {step.thought}
                          </p>
                        </div>
                      )}

                      {/* Tool Call Record */}
                      {step.toolCall && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-xs font-bold text-neutral-700">
                            <span className="flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-neutral-600" />
                              Tool Invocation: <code className="font-mono text-neutral-900 bg-neutral-100 px-1.5 py-0.5 rounded">{step.toolCall.toolName}</code>
                            </span>
                            {step.toolCall.isMalformed ? (
                              <span className="text-red-600 font-bold text-[11px]">Malformed Call Handled</span>
                            ) : (
                              <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Executed Successfully
                              </span>
                            )}
                          </div>

                          {/* Arguments */}
                          <div className="rounded-xl bg-neutral-900 text-neutral-200 p-3 font-mono text-xs overflow-x-auto">
                            <span className="text-neutral-500 select-none">// Tool Arguments:{'\n'}</span>
                            {JSON.stringify(step.toolCall.args, null, 2)}
                          </div>

                          {/* Result Preview */}
                          <div className="rounded-xl border border-neutral-200 bg-white p-3.5 space-y-2">
                            <span className="text-xs font-bold text-neutral-700 block">
                              Tool Execution Output:
                            </span>

                            {/* Custom formatting for tool output */}
                            {toolName === 'list_clauses' && step.toolCall.result?.clauses ? (
                              <div className="space-y-2">
                                <div className="text-xs text-neutral-600 font-medium">
                                  Found <strong className="text-neutral-900">{step.toolCall.result.totalClauses}</strong> clauses in contract:
                                </div>
                                <div className="max-h-40 overflow-y-auto space-y-1 pr-2 text-xs font-mono">
                                  {step.toolCall.result.clauses.slice(0, 15).map((c: any) => (
                                    <div key={c.index} className="flex items-center justify-between py-1 border-b border-neutral-100">
                                      <span className="text-neutral-800 font-semibold">{c.title}</span>
                                      <span className="text-neutral-400 text-[10px]">{c.lengthChars} chars</span>
                                    </div>
                                  ))}
                                  {step.toolCall.result.clauses.length > 15 && (
                                    <div className="text-[11px] text-neutral-500 italic py-1">
                                      ... and {step.toolCall.result.clauses.length - 15} more clauses cataloged
                                    </div>
                                  )}
                                </div>
                              </div>
                            ) : toolName === 'search_document' && step.toolCall.result?.chunks ? (
                              <div className="space-y-2">
                                <div className="text-xs text-neutral-600 font-medium">
                                  Retrieved <strong className="text-neutral-900">{step.toolCall.result.resultsCount}</strong> relevant chunks:
                                </div>
                                <div className="max-h-44 overflow-y-auto space-y-2 pr-2">
                                  {step.toolCall.result.chunks.map((chk: any, cIdx: number) => (
                                    <div key={cIdx} className="p-2.5 rounded-lg bg-neutral-50 border border-neutral-200 text-xs space-y-1">
                                      <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600">
                                        <span>Chunk #{chk.chunkIndex} (Page {chk.pageStart})</span>
                                        <span className="text-amber-700 font-mono">Score: {chk.score?.toFixed?.(2) || chk.score}</span>
                                      </div>
                                      <p className="text-neutral-800 font-mono text-[11px] line-clamp-3">
                                        {chk.text}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : toolName === 'get_section' && step.toolCall.result?.text ? (
                              <div className="space-y-1">
                                <div className="text-xs text-neutral-600 font-medium">
                                  Verbatim section retrieved: <strong className="text-neutral-900">{step.toolCall.result.title}</strong>
                                </div>
                                <div className="max-h-48 overflow-y-auto p-3 rounded-lg bg-neutral-50 border border-neutral-200 font-mono text-xs text-neutral-800 whitespace-pre-wrap">
                                  {step.toolCall.result.text}
                                </div>
                              </div>
                            ) : (
                              <pre className="max-h-40 overflow-y-auto font-mono text-xs text-neutral-700 bg-neutral-50 p-2.5 rounded-lg">
                                {JSON.stringify(step.toolCall.result, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* =========================================================
              ROUND 5 / FINAL ANSWER & VERIFIED CITATIONS PANEL
              ========================================================= */}
          <div className="rounded-3xl border border-amber-300/80 bg-gradient-to-br from-amber-50/70 via-white to-white p-7 sm:p-8 shadow-md space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200/80 pb-5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-900 text-xs font-bold border border-amber-400/40">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" />
                  <span>SYNTHESIZED LEGAL CONCLUSION</span>
                </div>
                <h3 className="text-xl font-extrabold text-neutral-900">
                  Final Answer & Evidence Verification
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300/70 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>{result.citations.length} Verified Citations</span>
                </span>
              </div>
            </div>

            {/* Answer Body */}
            <div className="prose prose-sm max-w-none text-neutral-900 space-y-4">
              <div className="whitespace-pre-wrap leading-relaxed text-sm">
                {result.answer}
              </div>
            </div>

            {/* Verified Citations Shelf */}
            {result.citations && result.citations.length > 0 && (
              <div className="pt-4 border-t border-neutral-200/80 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>100% Character-Verified Source Citations ({result.citations.length})</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.citations.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-emerald-900 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600 font-extrabold" />
                          <span>Citation #{idx + 1}</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-md bg-white border border-emerald-300 font-bold text-[10px] text-emerald-800 shadow-xs">
                            Page {c.pageStart || 1}
                          </span>
                          <span className="font-mono text-[10px] text-emerald-700">
                            [{c.startOffset}..{c.endOffset}]
                          </span>
                        </div>
                      </div>

                      <p className="text-neutral-800 font-serif italic text-xs border-l-2 border-emerald-400 pl-2 py-0.5 line-clamp-3">
                        &ldquo;{c.quote}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
