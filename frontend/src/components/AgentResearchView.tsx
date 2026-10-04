'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  runAgentResearch,
  fetchDocuments,
  DocumentItem,
  AgentResearchResult,
} from '@/lib/api';
import {
  Bot,
  Sparkles,
  FileText,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  Terminal,
  Cpu,
  Check,
  AlertCircle,
  Search,
  BookOpen,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const DEMO_PROMPTS = [
  {
    label: 'IP Indemnification & Conditions',
    query: 'What are the IP indemnification obligations and what conditions must Customer satisfy?',
    icon: '🛡️',
  },
  {
    label: 'Confidentiality & Survival',
    query: "What are the Customer's confidentiality obligations, and how long do they survive termination?",
    icon: '🔒',
  },
  {
    label: 'Limitation of Liability Caps',
    query: 'What are the limitation of liability provisions and what damages are excluded?',
    icon: '⚖️',
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
  const [showTechnicalLogs, setShowTechnicalLogs] = useState(false);
  const [expandedLogRounds, setExpandedLogRounds] = useState<Record<number, boolean>>({});

  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetchDocuments();
        if (res.success && res.data) {
          const readyDocs = res.data.filter((d) => d.status === 'READY');
          setDocuments(readyDocs);
          if (!selectedDocId && readyDocs.length > 0) {
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

  const handleRunAgent = async (overrideQuestion?: string) => {
    const q = (overrideQuestion || question).trim();
    if (!q || isLoading) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setShowTechnicalLogs(false);
    setExpandedLogRounds({});

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

  const getRoundSummary = (round: number, toolName?: string) => {
    switch (round) {
      case 1:
        return { label: 'Clause Topology', icon: BookOpen, desc: 'Mapped contract structure' };
      case 2:
        return { label: 'Targeted Search', icon: Search, desc: 'Located operative legal terms' };
      case 3:
        return { label: 'Section Deep-Dive', icon: FileText, desc: 'Extracted full clause provisions' };
      case 4:
        return { label: 'Corroborate Terms', icon: ShieldCheck, desc: 'Verified qualifying conditions' };
      case 5:
        return { label: 'Legal Synthesis', icon: Sparkles, desc: 'Synthesized opinion with citations' };
      default:
        return { label: `Round ${round}`, icon: Terminal, desc: toolName || 'Tool execution' };
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 space-y-8 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-neutral-200/80">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-800 text-xs font-bold tracking-wide">
            <Bot className="w-3.5 h-3.5 text-amber-600" />
            <span>AUTONOMOUS AGENT · PART C</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900">
            Autonomous Contract Intelligence
          </h1>
          <p className="text-sm text-neutral-500 max-w-2xl leading-relaxed">
            Autonomous multi-round contract investigation engine that plans queries, retrieves sections, corroborates reciprocal duties, and synthesizes 100% verified legal answers.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
          <span>5-Round Agentic Loop Active</span>
        </div>
      </div>

      {/* Query Control Card */}
      <div className="bg-white rounded-2xl border border-neutral-200/80 shadow-xs p-6 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Target Agreement Selector */}
          <div className="sm:col-span-2 space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-600" />
              Target Agreement
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200/90 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition cursor-pointer"
            >
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title || d.fileName} {d._count?.chunks ? `(${d._count.chunks} chunks)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Scenario Chips */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600" />
              Scenario Prompts
            </label>
            <div className="flex flex-col gap-1.5">
              <select
                onChange={(e) => {
                  const match = DEMO_PROMPTS.find((p) => p.query === e.target.value);
                  if (match) {
                    setQuestion(match.query);
                    handleRunAgent(match.query);
                  }
                }}
                className="w-full bg-neutral-50 border border-neutral-200/90 rounded-xl px-3 py-2.5 text-xs text-neutral-800 focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition cursor-pointer"
              >
                <option value="">Select a curated question...</option>
                {DEMO_PROMPTS.map((p, idx) => (
                  <option key={idx} value={p.query}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Input & Run Action */}
        <div className="space-y-2 pt-2 border-t border-neutral-100">
          <label className="text-xs font-bold uppercase tracking-wider text-neutral-600">
            Legal Inquiry
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRunAgent()}
              placeholder="Ask a contract research question..."
              className="flex-1 bg-neutral-50/70 border border-neutral-200 rounded-xl px-4 py-3 text-sm text-neutral-900 placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:bg-white transition"
            />
            <Button
              onClick={() => handleRunAgent()}
              disabled={isLoading || !question.trim()}
              className="px-6 py-3 rounded-xl bg-neutral-900 hover:bg-black text-white font-semibold text-sm shadow-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Researching...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Execute Research</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 flex items-start gap-3 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-600 mt-0.5" />
          <div>
            <span className="font-bold">Error executing research: </span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading Progress State */}
      {isLoading && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 sm:p-10 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="font-bold text-neutral-900 text-base">
              Autonomous Agent Conducting Research
            </h3>
            <p className="text-xs text-neutral-500 leading-relaxed">
              Iterating through clause structure, retrieving full section text, corroborating reciprocal obligations, and extracting verbatim verified quotes...
            </p>
          </div>
        </div>
      )}

      {/* Completed Research Report View */}
      {result && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Executive Stepper Pipeline */}
          <div className="bg-white rounded-2xl border border-neutral-200/90 p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                Agent Research Trajectory ({result.rounds} Rounds)
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                <span>Verification Complete</span>
              </span>
            </div>

            {/* Stepper Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
              {result.steps.map((step) => {
                const info = getRoundSummary(step.round, step.toolCall?.toolName);
                const IconComponent = info.icon;
                return (
                  <div
                    key={step.round}
                    className="p-3 rounded-xl bg-neutral-50/80 border border-neutral-200/70 space-y-1 transition hover:bg-neutral-100/60"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-neutral-400 uppercase">
                        Round {step.round}
                      </span>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-xs text-neutral-900">
                      <IconComponent className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="truncate">{info.label}</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 truncate">
                      {info.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Legal Opinion & Findings Card */}
          <div className="rounded-2xl border border-neutral-200/90 bg-white p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-neutral-100">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-800">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>SYNTHESIZED LEGAL FINDINGS</span>
                </div>
                <h2 className="text-xl font-bold text-neutral-900">
                  Legal Analysis & Verified Citations
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                  <span>{result.citations.length} Verified Citations</span>
                </span>
              </div>
            </div>

            {/* Structured Legal Answer */}
            <div className="prose prose-sm max-w-none text-neutral-800 space-y-4 font-normal leading-relaxed">
              <div className="whitespace-pre-wrap text-sm sm:text-[15px] space-y-3">
                {result.answer}
              </div>
            </div>

            {/* Verified Citations List */}
            {result.citations && result.citations.length > 0 && (
              <div className="pt-6 border-t border-neutral-100 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <span>100% Character-Verified Source Citations</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {result.citations.map((c, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-neutral-200/80 bg-neutral-50/60 space-y-2 text-xs transition hover:bg-neutral-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-800 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600 font-extrabold" />
                          <span>Citation {idx + 1}</span>
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-white border border-neutral-200 font-semibold text-neutral-700">
                            Page {c.pageStart || 1}
                          </span>
                          <span className="text-neutral-400">
                            [{c.startOffset}..{c.endOffset}]
                          </span>
                        </div>
                      </div>

                      <blockquote className="text-neutral-700 italic border-l-2 border-amber-400 pl-2.5 py-0.5 leading-normal line-clamp-3">
                        &ldquo;{c.quote}&rdquo;
                      </blockquote>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Technical Execution Accordion (Collapsed by Default) */}
          <div className="rounded-2xl border border-neutral-200/80 bg-white overflow-hidden shadow-xs">
            <button
              type="button"
              onClick={() => setShowTechnicalLogs(!showTechnicalLogs)}
              className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-neutral-50 transition cursor-pointer select-none"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-neutral-500" />
                <span className="text-xs font-bold text-neutral-800">
                  Inspect Technical Agent Tool Calls & Reasoning
                </span>
                <span className="text-[11px] text-neutral-400">
                  ({result.steps.length} rounds logged)
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-neutral-500 font-medium">
                <span>{showTechnicalLogs ? 'Hide Details' : 'Show Details'}</span>
                {showTechnicalLogs ? (
                  <ChevronUp className="w-4 h-4 text-neutral-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-neutral-500" />
                )}
              </div>
            </button>

            {showTechnicalLogs && (
              <div className="border-t border-neutral-100 p-5 space-y-4 bg-neutral-50/50">
                {result.steps.map((s) => {
                  const isRoundOpen = Boolean(expandedLogRounds[s.round]);
                  return (
                    <div
                      key={s.round}
                      className="rounded-xl border border-neutral-200 bg-white overflow-hidden text-xs"
                    >
                      <div
                        onClick={() =>
                          setExpandedLogRounds((prev) => ({
                            ...prev,
                            [s.round]: !prev[s.round],
                          }))
                        }
                        className="p-3.5 flex items-center justify-between hover:bg-neutral-50 transition cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-2.5 font-mono">
                          <span className="px-2 py-0.5 rounded bg-neutral-900 text-white font-bold text-[10px]">
                            R{s.round}
                          </span>
                          <span className="font-semibold text-neutral-800">
                            {s.toolCall?.toolName || 'tool'}()
                          </span>
                          <span className="text-neutral-400 text-[11px] font-sans truncate max-w-sm hidden sm:inline">
                            {s.thought}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                          {isRoundOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      {isRoundOpen && (
                        <div className="p-4 border-t border-neutral-100 space-y-3 bg-neutral-50/30">
                          {s.thought && (
                            <div className="space-y-1">
                              <span className="font-bold text-[10px] uppercase text-neutral-500">Agent Reasoning:</span>
                              <p className="text-neutral-800 font-sans text-xs bg-amber-50/50 p-2.5 rounded-lg border border-amber-200/60">
                                {s.thought}
                              </p>
                            </div>
                          )}

                          {s.toolCall && (
                            <div className="space-y-2">
                              <span className="font-bold text-[10px] uppercase text-neutral-500 font-mono">
                                Arguments:
                              </span>
                              <pre className="p-2.5 rounded-lg bg-neutral-900 text-neutral-200 font-mono text-[11px] overflow-x-auto">
                                {JSON.stringify(s.toolCall.args, null, 2)}
                              </pre>

                              <span className="font-bold text-[10px] uppercase text-neutral-500 font-mono">
                                Output Preview:
                              </span>
                              <pre className="p-2.5 rounded-lg bg-white border border-neutral-200 text-neutral-700 font-mono text-[11px] max-h-40 overflow-y-auto">
                                {JSON.stringify(s.toolCall.result, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
