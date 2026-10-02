'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  DocumentItem,
  ComparisonResult,
  ClauseComparison,
  SignificanceLevel,
  ChangeType,
  fetchDocuments,
  compareContracts,
} from '@/lib/api';
import {
  Scale,
  GitCompare,
  ArrowRightLeft,
  Filter,
  ArrowUpDown,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Layers,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  Columns,
  SquareSplitHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export interface ComparisonProps {
  initialDocAId?: string;
  initialDocBId?: string;
}

export default function Comparison({ initialDocAId, initialDocBId }: ComparisonProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState<boolean>(true);

  const [docAId, setDocAId] = useState<string>(initialDocAId || '');
  const [docBId, setDocBId] = useState<string>(initialDocBId || '');

  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters & Sorting state
  const [significanceFilter, setSignificanceFilter] = useState<'ALL' | SignificanceLevel>('ALL');
  const [changeTypeFilter, setChangeTypeFilter] = useState<'ALL' | ChangeType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'significance-desc' | 'significance-asc' | 'order' | 'title'>('significance-desc');
  const [layoutMode, setLayoutMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  // Expanded clauses
  const [expandedClauses, setExpandedClauses] = useState<Record<string, boolean>>({});

  // Load document library
  useEffect(() => {
    async function loadDocs() {
      try {
        const res = await fetchDocuments();
        if (res.success && Array.isArray(res.data)) {
          // Filter to ready documents
          const ready = res.data.filter((d) => d.status?.toUpperCase() === 'READY');
          setDocuments(ready);

          // Default selection if not already provided
          if (!docAId && ready.length > 0) {
            setDocAId(ready[0].id);
          }
          if (!docBId && ready.length > 1) {
            setDocBId(ready[1].id);
          }
        }
      } catch (err: any) {
        console.error('Failed to load documents for comparison', err);
      } finally {
        setIsLoadingDocs(false);
      }
    }
    loadDocs();
  }, [docAId, docBId]);

  // Execute Comparison
  const handleCompare = async () => {
    if (!docAId || !docBId) {
      setErrorMessage('Please select both Version 1 and Version 2 contracts to compare.');
      return;
    }
    if (docAId === docBId) {
      setErrorMessage('Please select two distinct contract versions.');
      return;
    }

    setIsComparing(true);
    setErrorMessage(null);

    try {
      const res = await compareContracts(docAId, docBId);
      if (res.success && res.data) {
        setComparisonResult(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to compare documents.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while comparing contracts.');
    } finally {
      setIsComparing(false);
    }
  };

  // Swap Version 1 and Version 2
  const handleSwap = () => {
    const temp = docAId;
    setDocAId(docBId);
    setDocBId(temp);
    if (comparisonResult) {
      // Re-trigger comparison with swapped order
      setTimeout(() => {
        handleCompare();
      }, 50);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedClauses((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const expandAll = () => {
    if (!comparisonResult) return;
    const all: Record<string, boolean> = {};
    comparisonResult.comparisons.forEach((c) => {
      all[c.id] = true;
    });
    setExpandedClauses(all);
  };

  const collapseAll = () => {
    setExpandedClauses({});
  };

  // Filter and Sort comparisons
  const filteredAndSortedComparisons = useMemo(() => {
    if (!comparisonResult) return [];

    let list = comparisonResult.comparisons.filter((c) => c.changeType !== 'unchanged');

    // Filter by Significance
    if (significanceFilter !== 'ALL') {
      list = list.filter((c) => c.significance === significanceFilter);
    }

    // Filter by Change Type
    if (changeTypeFilter !== 'ALL') {
      list = list.filter((c) => c.changeType === changeTypeFilter);
    }

    // Filter by Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (c) =>
          c.clause.toLowerCase().includes(q) ||
          c.summary.toLowerCase().includes(q) ||
          (c.oldText && c.oldText.toLowerCase().includes(q)) ||
          (c.newText && c.newText.toLowerCase().includes(q))
      );
    }

    // Sort
    const sigOrder: Record<SignificanceLevel, number> = { High: 3, Medium: 2, Low: 1 };
    list.sort((a, b) => {
      if (sortBy === 'significance-desc') {
        return sigOrder[b.significance] - sigOrder[a.significance];
      }
      if (sortBy === 'significance-asc') {
        return sigOrder[a.significance] - sigOrder[b.significance];
      }
      if (sortBy === 'title') {
        return a.clause.localeCompare(b.clause);
      }
      return 0; // 'order' retains document clause order
    });

    return list;
  }, [comparisonResult, significanceFilter, changeTypeFilter, searchQuery, sortBy]);

  const selectedDocA = documents.find((d) => d.id === docAId);
  const selectedDocB = documents.find((d) => d.id === docBId);

  return (
    <div className="space-y-8">
      {/* Document Selection Card */}
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 shadow-xl backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800/60">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-indigo-400" />
              Contract Version Comparison
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select two versions of a contract to identify substantive clause-level differences and financial/legal risk changes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleCompare}
              disabled={isComparing || !docAId || !docBId || docAId === docBId}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              <GitCompare className={`w-4 h-4 ${isComparing ? 'animate-spin' : ''}`} />
              {isComparing ? 'Analyzing Differences...' : 'Compare Contracts'}
            </Button>
          </div>
        </div>

        {/* Pickers Row */}
        <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center pt-6">
          {/* Version 1 (Document A) */}
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Version 1 (Original / Base)
              </label>
              {selectedDocA && (
                <span className="text-[11px] text-slate-500">
                  {selectedDocA.pageCount || 1} pages
                </span>
              )}
            </div>
            <select
              value={docAId}
              onChange={(e) => setDocAId(e.target.value)}
              disabled={isLoadingDocs}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="" disabled>
                {isLoadingDocs ? 'Loading contracts...' : '-- Select Version 1 --'}
              </option>
              {documents.map((doc) => (
                <option key={`a-${doc.id}`} value={doc.id}>
                  {doc.title || doc.fileName}
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="md:col-span-1 flex justify-center pt-4 md:pt-0">
            <button
              onClick={handleSwap}
              type="button"
              title="Swap Version 1 and Version 2"
              className="p-2.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 shadow-md transition-all hover:rotate-180 duration-300"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Version 2 (Document B) */}
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Version 2 (Revised / New)
              </label>
              {selectedDocB && (
                <span className="text-[11px] text-slate-500">
                  {selectedDocB.pageCount || 1} pages
                </span>
              )}
            </div>
            <select
              value={docBId}
              onChange={(e) => setDocBId(e.target.value)}
              disabled={isLoadingDocs}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="" disabled>
                {isLoadingDocs ? 'Loading contracts...' : '-- Select Version 2 --'}
              </option>
              {documents.map((doc) => (
                <option key={`b-${doc.id}`} value={doc.id}>
                  {doc.title || doc.fileName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Comparison Results */}
      {comparisonResult && (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="p-6 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-indigo-950/30 border border-indigo-500/20 rounded-2xl shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100">
                    Executive Substantive Summary
                  </h3>
                  <p className="text-xs text-slate-400">
                    Comparing &ldquo;{comparisonResult.documentA.title}&rdquo; &rarr; &ldquo;{comparisonResult.documentB.title}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60">
                  Total Differences: <strong className="text-white">{comparisonResult.totalChanges}</strong>
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-300 bg-slate-950/40 p-4 rounded-xl border border-slate-800/60">
              {comparisonResult.executiveSummary}
            </p>

            {/* Counts Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                {comparisonResult.counts.high} High Significance
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                {comparisonResult.counts.medium} Medium Significance
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold">
                <Info className="w-3.5 h-3.5" />
                {comparisonResult.counts.low} Low Significance
              </div>
              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span>{comparisonResult.counts.modified} Modified</span>
                <span>•</span>
                <span>{comparisonResult.counts.added} Added</span>
                <span>•</span>
                <span>{comparisonResult.counts.removed} Removed</span>
              </div>
            </div>
          </div>

          {/* Filter & Sort Controls Toolbar */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Significance Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" /> Significance:
              </span>
              <button
                onClick={() => setSignificanceFilter('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  significanceFilter === 'ALL'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
                }`}
              >
                All ({comparisonResult.totalChanges})
              </button>
              <button
                onClick={() => setSignificanceFilter('High')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                  significanceFilter === 'High'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                High ({comparisonResult.counts.high})
              </button>
              <button
                onClick={() => setSignificanceFilter('Medium')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                  significanceFilter === 'Medium'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Medium ({comparisonResult.counts.medium})
              </button>
              <button
                onClick={() => setSignificanceFilter('Low')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                  significanceFilter === 'Low'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20'
                }`}
              >
                <Info className="w-3 h-3" />
                Low ({comparisonResult.counts.low})
              </button>
            </div>

            {/* Change Type Filter + Search + Sort */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Change Type Filter */}
              <select
                value={changeTypeFilter}
                onChange={(e) => setChangeTypeFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
              >
                <option value="ALL">All Change Types</option>
                <option value="modified">Modified Only</option>
                <option value="added">Added Only</option>
                <option value="removed">Removed Only</option>
              </select>

              {/* Sort Order */}
              <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1">
                <ArrowUpDown className="w-3 h-3 text-slate-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-slate-300 focus:outline-none"
                >
                  <option value="significance-desc">Significance (High to Low)</option>
                  <option value="significance-asc">Significance (Low to High)</option>
                  <option value="order">Clause Order</option>
                  <option value="title">Clause Title (A-Z)</option>
                </select>
              </div>

              {/* Layout Mode */}
              <div className="flex items-center border border-slate-800 rounded-lg p-0.5 bg-slate-950">
                <button
                  onClick={() => setLayoutMode('side-by-side')}
                  title="Side by Side View"
                  className={`p-1.5 rounded text-xs transition-colors ${
                    layoutMode === 'side-by-side' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <SquareSplitHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLayoutMode('unified')}
                  title="Unified Stacked View"
                  className={`p-1.5 rounded text-xs transition-colors ${
                    layoutMode === 'unified' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expand / Collapse All */}
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAll}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                >
                  Expand all
                </button>
                <span className="text-slate-600">•</span>
                <button
                  onClick={collapseAll}
                  className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </div>

          {/* Search Query Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search in changed clauses, summaries, or terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-800/80 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Changes Count & Listing */}
          <div className="space-y-4">
            {filteredAndSortedComparisons.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/30 border border-slate-800/80 rounded-2xl">
                <p className="text-sm text-slate-400">No clause changes match your active filters.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSignificanceFilter('ALL');
                    setChangeTypeFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-3 text-xs border-slate-700 text-slate-300"
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              filteredAndSortedComparisons.map((item, idx) => {
                const isExpanded = expandedClauses[item.id] ?? true;

                // Color mappings
                const sigBadgeClass =
                  item.significance === 'High'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : item.significance === 'Medium'
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    : 'bg-blue-500/10 text-blue-400 border-blue-500/20';

                const sigIcon =
                  item.significance === 'High' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  ) : item.significance === 'Medium' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-blue-400" />
                  );

                const typeBadgeClass =
                  item.changeType === 'added'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : item.changeType === 'removed'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';

                return (
                  <div
                    key={item.id}
                    className="bg-slate-900/60 border border-slate-800/80 rounded-2xl overflow-hidden shadow-lg transition-all hover:border-slate-700/80"
                  >
                    {/* Header */}
                    <div
                      onClick={() => toggleExpand(item.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-slate-900/40 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          {sigIcon}
                          <span className="font-semibold text-sm text-slate-100">
                            {item.clause}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${sigBadgeClass}`}
                          >
                            {item.significance} Significance
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${typeBadgeClass}`}
                          >
                            {item.changeType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="p-1 rounded text-slate-400 hover:text-white"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Substantive Summary Banner */}
                    <div className="px-4 py-2.5 bg-indigo-950/30 border-y border-indigo-500/20 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <div className="text-xs text-indigo-200">
                        <strong className="font-semibold text-indigo-100">Substantive Impact: </strong>
                        {item.summary}
                      </div>
                    </div>

                    {/* Body Comparison */}
                    {isExpanded && (
                      <div className="p-4">
                        {layoutMode === 'side-by-side' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Version 1 Text */}
                            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                                <span className="text-[11px] font-semibold text-rose-400 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                                  Version 1 (Old Text)
                                </span>
                                {item.changeType === 'added' && (
                                  <span className="text-[10px] text-slate-500 italic">Not Present</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-slate-300 leading-relaxed max-h-80 overflow-y-auto pr-1 whitespace-pre-wrap">
                                {item.oldText ? (
                                  <span className="bg-rose-500/10 text-rose-200/90 p-0.5 rounded">
                                    {item.oldText}
                                  </span>
                                ) : (
                                  <span className="text-slate-600 italic">
                                    [Clause was not present in Version 1]
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Version 2 Text */}
                            <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
                                <span className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                  Version 2 (New Text)
                                </span>
                                {item.changeType === 'removed' && (
                                  <span className="text-[10px] text-slate-500 italic">Removed</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-slate-300 leading-relaxed max-h-80 overflow-y-auto pr-1 whitespace-pre-wrap">
                                {item.newText ? (
                                  <span className="bg-emerald-500/10 text-emerald-200/90 p-0.5 rounded">
                                    {item.newText}
                                  </span>
                                ) : (
                                  <span className="text-rose-500/80 italic">
                                    [Clause removed in Version 2]
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Unified Stacked View */
                          <div className="space-y-3">
                            {item.oldText && (
                              <div className="bg-rose-950/20 border border-rose-500/20 rounded-xl p-3">
                                <span className="text-[10px] font-bold uppercase text-rose-400 block mb-1">
                                  - Version 1 (Old)
                                </span>
                                <div className="text-xs font-mono text-rose-200/90 whitespace-pre-wrap leading-relaxed">
                                  {item.oldText}
                                </div>
                              </div>
                            )}
                            {item.newText && (
                              <div className="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3">
                                <span className="text-[10px] font-bold uppercase text-emerald-400 block mb-1">
                                  + Version 2 (New)
                                </span>
                                <div className="text-xs font-mono text-emerald-200/90 whitespace-pre-wrap leading-relaxed">
                                  {item.newText}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
