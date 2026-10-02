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

  // Accordion state: map of clauseId -> isExpanded
  const [expandedClauses, setExpandedClauses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadDocs() {
      try {
        setIsLoadingDocs(true);
        const res = await fetchDocuments();
        if (res.success && Array.isArray(res.data)) {
          const readyDocs = res.data.filter((d) => d.status?.toUpperCase() === 'READY');
          setDocuments(readyDocs);

          if (!docAId && readyDocs.length > 0) {
            setDocAId(readyDocs[0].id);
          }
          if (!docBId && readyDocs.length > 1) {
            setDocBId(readyDocs[1].id);
          }
        }
      } catch (err: any) {
        console.error('Error loading documents for comparison', err);
      } finally {
        setIsLoadingDocs(false);
      }
    }
    loadDocs();
  }, []);

  const handleSwap = () => {
    const temp = docAId;
    setDocAId(docBId);
    setDocBId(temp);
    if (comparisonResult) {
      setComparisonResult(null);
    }
  };

  const handleCompare = async () => {
    if (!docAId || !docBId) {
      setErrorMessage('Please select two contracts to compare.');
      return;
    }
    if (docAId === docBId) {
      setErrorMessage('Please select two distinct contracts or different versions to perform comparison.');
      return;
    }

    setIsComparing(true);
    setErrorMessage(null);

    try {
      const res = await compareContracts(docAId, docBId);
      if (res.success && res.data) {
        setComparisonResult(res.data);
        const initialExpanded: Record<string, boolean> = {};
        res.data.comparisons.forEach((c) => {
          initialExpanded[c.id] = true;
        });
        setExpandedClauses(initialExpanded);
      } else {
        setErrorMessage(res.error || 'Failed to generate contract comparison.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while comparing contracts.');
    } finally {
      setIsComparing(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedClauses((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    if (!comparisonResult) return;
    const update: Record<string, boolean> = {};
    comparisonResult.comparisons.forEach((c) => {
      update[c.id] = true;
    });
    setExpandedClauses(update);
  };

  const collapseAll = () => {
    setExpandedClauses({});
  };

  const filteredAndSortedComparisons = useMemo(() => {
    if (!comparisonResult) return [];

    let list = [...comparisonResult.comparisons];

    if (significanceFilter !== 'ALL') {
      list = list.filter((c) => c.significance === significanceFilter);
    }

    if (changeTypeFilter !== 'ALL') {
      list = list.filter((c) => c.changeType === changeTypeFilter);
    }

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

    const significanceRank: Record<SignificanceLevel, number> = {
      High: 3,
      Medium: 2,
      Low: 1,
    };

    list.sort((a, b) => {
      if (sortBy === 'significance-desc') {
        return significanceRank[b.significance] - significanceRank[a.significance];
      }
      if (sortBy === 'significance-asc') {
        return significanceRank[a.significance] - significanceRank[b.significance];
      }
      if (sortBy === 'title') {
        return a.clause.localeCompare(b.clause);
      }
      return 0;
    });

    return list;
  }, [comparisonResult, significanceFilter, changeTypeFilter, searchQuery, sortBy]);

  const selectedDocA = documents.find((d) => d.id === docAId);
  const selectedDocB = documents.find((d) => d.id === docBId);

  return (
    <div className="space-y-8 font-sans">
      {/* Document Selection Card */}
      <div className="bg-white border border-neutral-200/90 rounded-3xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-neutral-200/70">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-amber-500" />
              Contract Version Comparison
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              Select two versions of an agreement to analyze substantive differences, financial terms, and legal liability shifts.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handleCompare}
              disabled={isComparing || !docAId || !docBId || docAId === docBId}
              className="bg-neutral-900 hover:bg-black text-white font-bold px-6 py-2.5 rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            >
              <GitCompare className={`w-4 h-4 ${isComparing ? 'animate-spin text-amber-400' : ''}`} />
              {isComparing ? 'Analyzing Differences...' : 'Compare Contracts'}
            </Button>
          </div>
        </div>

        {/* Pickers Row */}
        <div className="grid grid-cols-1 md:grid-cols-11 gap-4 items-center pt-6">
          {/* Version 1 (Document A) */}
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-rose-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                Version 1 (Original / Base)
              </label>
              {selectedDocA && (
                <span className="text-[11px] text-neutral-400">
                  {selectedDocA.pageCount || 1} pages
                </span>
              )}
            </div>
            <select
              value={docAId}
              onChange={(e) => setDocAId(e.target.value)}
              disabled={isLoadingDocs}
              className="w-full bg-neutral-50 border border-neutral-200/90 rounded-2xl px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition cursor-pointer"
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
              className="p-3 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200 shadow-2xs transition-all hover:rotate-180 duration-300 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          {/* Version 2 (Document B) */}
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-emerald-600 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Version 2 (Revised / New)
              </label>
              {selectedDocB && (
                <span className="text-[11px] text-neutral-400">
                  {selectedDocB.pageCount || 1} pages
                </span>
              )}
            </div>
            <select
              value={docBId}
              onChange={(e) => setDocBId(e.target.value)}
              disabled={isLoadingDocs}
              className="w-full bg-neutral-50 border border-neutral-200/90 rounded-2xl px-4 py-3 text-sm text-neutral-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400/50 transition cursor-pointer"
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
          <div className="mt-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Comparison Results */}
      {comparisonResult && (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="p-6 sm:p-8 bg-gradient-to-br from-white via-amber-50/20 to-white border border-amber-200/90 rounded-3xl shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-amber-500/10 text-amber-700 border border-amber-500/20">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-neutral-900">
                    Executive Substantive Summary
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Comparing &ldquo;{comparisonResult.documentA.title}&rdquo; &rarr; &ldquo;{comparisonResult.documentB.title}&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
                  Total Differences: <strong className="text-neutral-900">{comparisonResult.totalChanges}</strong>
                </span>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-neutral-700 bg-neutral-50/80 p-4 rounded-2xl border border-neutral-200/70">
              {comparisonResult.executiveSummary}
            </p>

            {/* Counts Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                {comparisonResult.counts.high} High Significance
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                {comparisonResult.counts.medium} Medium Significance
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                <Info className="w-3.5 h-3.5 text-blue-500" />
                {comparisonResult.counts.low} Low Significance
              </div>
              <div className="h-4 w-px bg-neutral-200 mx-1 hidden sm:block" />
              <div className="text-xs text-neutral-500 flex items-center gap-2">
                <span>{comparisonResult.counts.modified} Modified</span>
                <span>&bull;</span>
                <span>{comparisonResult.counts.added} Added</span>
                <span>&bull;</span>
                <span>{comparisonResult.counts.removed} Removed</span>
              </div>
            </div>
          </div>

          {/* Filter & Sort Controls Toolbar */}
          <div className="bg-white border border-neutral-200/90 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-2xs">
            {/* Significance Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-neutral-400 mr-1 flex items-center gap-1 font-medium">
                <Filter className="w-3.5 h-3.5" /> Significance:
              </span>
              <button
                onClick={() => setSignificanceFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  significanceFilter === 'ALL'
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                All ({comparisonResult.totalChanges})
              </button>
              <button
                onClick={() => setSignificanceFilter('High')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  significanceFilter === 'High'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                }`}
              >
                <AlertCircle className="w-3 h-3" />
                High ({comparisonResult.counts.high})
              </button>
              <button
                onClick={() => setSignificanceFilter('Medium')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  significanceFilter === 'Medium'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                }`}
              >
                <AlertTriangle className="w-3 h-3" />
                Medium ({comparisonResult.counts.medium})
              </button>
              <button
                onClick={() => setSignificanceFilter('Low')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  significanceFilter === 'Low'
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
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
                className="bg-neutral-50 border border-neutral-200 rounded-xl px-2.5 py-1.5 text-xs text-neutral-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="ALL">All Change Types</option>
                <option value="modified">Modified Only</option>
                <option value="added">Added Only</option>
                <option value="removed">Removed Only</option>
              </select>

              {/* Sort Order */}
              <div className="flex items-center gap-1 bg-neutral-50 border border-neutral-200 rounded-xl px-2 py-1">
                <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-transparent text-xs text-neutral-800 focus:outline-none cursor-pointer"
                >
                  <option value="significance-desc">Significance (High to Low)</option>
                  <option value="significance-asc">Significance (Low to High)</option>
                  <option value="order">Clause Order</option>
                  <option value="title">Clause Title (A-Z)</option>
                </select>
              </div>

              {/* Layout Mode */}
              <div className="flex items-center border border-neutral-200 rounded-xl p-0.5 bg-neutral-50">
                <button
                  onClick={() => setLayoutMode('side-by-side')}
                  title="Side by Side View"
                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    layoutMode === 'side-by-side' ? 'bg-white shadow-2xs text-neutral-900 font-bold' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <SquareSplitHorizontal className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setLayoutMode('unified')}
                  title="Unified Stacked View"
                  className={`p-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
                    layoutMode === 'unified' ? 'bg-white shadow-2xs text-neutral-900 font-bold' : 'text-neutral-500 hover:text-neutral-900'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Expand / Collapse All */}
              <div className="flex items-center gap-1 text-xs text-neutral-500">
                <button
                  onClick={expandAll}
                  className="px-2 py-1 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Expand all
                </button>
                <span>&bull;</span>
                <button
                  onClick={collapseAll}
                  className="px-2 py-1 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg cursor-pointer"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </div>

          {/* Search Query Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search in changed clauses, summaries, or terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-neutral-200/90 rounded-2xl pl-9 pr-4 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-2xs"
            />
          </div>

          {/* Changes Listing */}
          <div className="space-y-4">
            {filteredAndSortedComparisons.length === 0 ? (
              <div className="p-12 text-center bg-white border border-neutral-200 rounded-3xl shadow-2xs">
                <p className="text-sm text-neutral-500">No clause changes match your active filters.</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSignificanceFilter('ALL');
                    setChangeTypeFilter('ALL');
                    setSearchQuery('');
                  }}
                  className="mt-3 text-xs border-neutral-200 text-neutral-700 cursor-pointer"
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              filteredAndSortedComparisons.map((item) => {
                const isExpanded = expandedClauses[item.id] ?? true;

                const sigBadgeClass =
                  item.significance === 'High'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : item.significance === 'Medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200';

                const sigIcon =
                  item.significance === 'High' ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  ) : item.significance === 'Medium' ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                  );

                const typeBadgeClass =
                  item.changeType === 'added'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : item.changeType === 'removed'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div
                    key={item.id}
                    className="bg-white border border-neutral-200/90 rounded-2xl overflow-hidden shadow-2xs transition-all hover:border-neutral-300"
                  >
                    {/* Header */}
                    <div
                      onClick={() => toggleExpand(item.id)}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer bg-white hover:bg-neutral-50/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          {sigIcon}
                          <span className="font-bold text-sm text-neutral-900">
                            {item.clause}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${sigBadgeClass}`}
                          >
                            {item.significance} Significance
                          </span>
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${typeBadgeClass}`}
                          >
                            {item.changeType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="p-1 rounded text-neutral-400 hover:text-neutral-700 cursor-pointer"
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
                    <div className="px-4 py-2.5 bg-amber-50/50 border-y border-amber-200/60 flex items-start gap-2.5">
                      <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-neutral-800">
                        <strong className="font-bold text-neutral-900">Substantive Impact: </strong>
                        {item.summary}
                      </div>
                    </div>

                    {/* Body Comparison */}
                    {isExpanded && (
                      <div className="p-4">
                        {layoutMode === 'side-by-side' ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Version 1 Text */}
                            <div className="bg-rose-50/50 border border-rose-200/70 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center justify-between border-b border-rose-200/60 pb-2">
                                <span className="text-[11px] font-bold text-rose-700 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                                  Version 1 (Old Text)
                                </span>
                                {item.changeType === 'added' && (
                                  <span className="text-[10px] text-neutral-400 italic">Not Present</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-neutral-800 leading-relaxed max-h-80 overflow-y-auto pr-1 whitespace-pre-wrap">
                                {item.oldText ? (
                                  <span className="text-rose-900">
                                    {item.oldText}
                                  </span>
                                ) : (
                                  <span className="text-neutral-400 italic">
                                    [Clause was not present in Version 1]
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Version 2 Text */}
                            <div className="bg-emerald-50/50 border border-emerald-200/70 rounded-xl p-3.5 space-y-2">
                              <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                                <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                  Version 2 (New Text)
                                </span>
                                {item.changeType === 'removed' && (
                                  <span className="text-[10px] text-neutral-400 italic">Removed</span>
                                )}
                              </div>
                              <div className="text-xs font-mono text-neutral-800 leading-relaxed max-h-80 overflow-y-auto pr-1 whitespace-pre-wrap">
                                {item.newText ? (
                                  <span className="text-emerald-900">
                                    {item.newText}
                                  </span>
                                ) : (
                                  <span className="text-rose-600 italic">
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
                              <div className="bg-rose-50/60 border border-rose-200/70 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase text-rose-700 block mb-1">
                                  - Version 1 (Old)
                                </span>
                                <div className="text-xs font-mono text-rose-900 whitespace-pre-wrap leading-relaxed">
                                  {item.oldText}
                                </div>
                              </div>
                            )}
                            {item.newText && (
                              <div className="bg-emerald-50/60 border border-emerald-200/70 rounded-xl p-3.5">
                                <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">
                                  + Version 2 (New)
                                </span>
                                <div className="text-xs font-mono text-emerald-900 whitespace-pre-wrap leading-relaxed">
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
