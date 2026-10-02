'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  AlertTriangle,
  Loader2,
  Highlighter,
  X,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  highlightQuoteInTextLayer,
  HighlightTarget,
  HighlightResult,
  clearExistingHighlights,
} from '@/lib/citation-highlight';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure standard CDN worker for pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface PdfViewerProps {
  url: string;
  initialPage?: number;
  fileName?: string;
  highlightTarget?: HighlightTarget | null;
  onClearHighlight?: () => void;
}

export default function PdfViewer({
  url,
  initialPage = 1,
  fileName,
  highlightTarget,
  onClearHighlight,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.1);
  const [rotation, setRotation] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [highlightStatus, setHighlightStatus] = useState<HighlightResult | null>(null);

  const pageContainerRef = useRef<HTMLDivElement>(null);

  // Sync initialPage or highlight target page
  useEffect(() => {
    if (highlightTarget?.pageStart && highlightTarget.pageStart !== pageNumber) {
      setPageNumber(highlightTarget.pageStart);
    } else if (initialPage && initialPage !== pageNumber && !highlightTarget) {
      setPageNumber(initialPage);
    }
  }, [highlightTarget, initialPage]);

  // Apply quote highlighting
  const applyHighlight = useCallback(() => {
    if (!pageContainerRef.current) return;

    if (!highlightTarget || !highlightTarget.quote) {
      clearExistingHighlights(pageContainerRef.current);
      setHighlightStatus(null);
      return;
    }

    const res = highlightQuoteInTextLayer(pageContainerRef.current, highlightTarget, pageNumber);
    setHighlightStatus(res);
  }, [highlightTarget, pageNumber]);

  // Re-run highlighting on page or target change
  useEffect(() => {
    const timer = setTimeout(() => {
      applyHighlight();
    }, 150);
    return () => clearTimeout(timer);
  }, [applyHighlight, pageNumber, scale, rotation]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
    setError(null);
    const targetP = highlightTarget?.pageStart || initialPage;
    if (targetP <= numPages) {
      setPageNumber(targetP);
    }
  };

  const onDocumentLoadError = (err: Error) => {
    console.error('Failed to load PDF document:', err);
    setError(err.message || 'Failed to load PDF. Please ensure the file is valid and accessible.');
    setIsLoading(false);
  };

  const handlePrevPage = () => {
    setPageNumber((prev) => Math.max(prev - 1, 1));
  };

  const handleNextPage = () => {
    setPageNumber((prev) => Math.min(prev + 1, numPages));
  };

  const handlePageInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= numPages) {
      setPageNumber(val);
    }
  };

  const zoomIn = () => setScale((s) => Math.min(Number((s + 0.15).toFixed(2)), 2.5));
  const zoomOut = () => setScale((s) => Math.max(Number((s - 0.15).toFixed(2)), 0.6));
  const resetZoom = () => setScale(1.1);
  const rotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div className="flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl relative">
      {/* Viewer Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/80 border-b border-slate-800 text-slate-200 z-20">
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-medium text-slate-300 truncate max-w-[180px] sm:max-w-xs">
            {fileName || 'Document Viewer'}
          </span>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-2 py-1 rounded-xl">
          <Button
            size="sm"
            variant="ghost"
            onClick={handlePrevPage}
            disabled={pageNumber <= 1 || isLoading}
            className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>

          <div className="flex items-center space-x-1 text-xs text-slate-300 px-1">
            <span>Page</span>
            <input
              type="number"
              min={1}
              max={numPages || 1}
              value={pageNumber}
              onChange={handlePageInput}
              disabled={isLoading || numPages === 0}
              className="w-10 text-center bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded px-1 py-0.5 text-xs text-slate-100 outline-none"
            />
            <span>of {numPages || '–'}</span>
          </div>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleNextPage}
            disabled={pageNumber >= numPages || isLoading}
            className="h-7 w-7 p-0 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Zoom & View Controls */}
        <div className="flex items-center space-x-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={zoomOut}
            disabled={scale <= 0.6 || isLoading}
            title="Zoom Out"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>

          <button
            onClick={resetZoom}
            title="Reset Zoom"
            className="text-xs px-2 py-1 rounded bg-slate-900/60 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition-colors"
          >
            {Math.round(scale * 100)}%
          </button>

          <Button
            size="sm"
            variant="ghost"
            onClick={zoomIn}
            disabled={scale >= 2.5 || isLoading}
            title="Zoom In"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={rotate}
            disabled={isLoading}
            title="Rotate"
            className="h-8 w-8 p-0 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Floating Citation Highlight Banner */}
      {highlightTarget?.quote && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-amber-200 backdrop-blur-md z-10 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center space-x-2 overflow-hidden mr-2">
            <Highlighter className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="overflow-hidden">
              <span className="font-semibold text-amber-300">Active Citation Highlight: </span>
              <span className="italic truncate inline-block max-w-sm sm:max-w-md align-bottom">
                &ldquo;{highlightTarget.quote}&rdquo;
              </span>
              {highlightTarget.startOffset !== undefined && (
                <span className="ml-2 font-mono text-[10px] text-amber-400/80">
                  [{highlightTarget.startOffset}..{highlightTarget.endOffset}]
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {highlightStatus?.found ? (
              <span className="inline-flex items-center gap-1 text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3 text-amber-400" />
                {highlightStatus.highlightedCount} lines highlighted
              </span>
            ) : (
              <span className="text-[10px] text-amber-400/70">Searching page text layer...</span>
            )}

            {onClearHighlight && (
              <button
                onClick={onClearHighlight}
                className="p-1 rounded text-amber-400 hover:text-amber-100 hover:bg-amber-500/20 transition-colors"
                title="Dismiss highlight"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Document View Canvas */}
      <div
        ref={pageContainerRef}
        className="flex-1 overflow-auto p-4 sm:p-6 flex items-start justify-center bg-slate-950/50 min-h-[550px] relative"
      >
        {error ? (
          <div className="m-auto text-center p-8 bg-rose-500/10 border border-rose-500/20 rounded-2xl max-w-md">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h4 className="text-sm font-semibold text-rose-200">Unable to Display PDF</h4>
            <p className="text-xs text-rose-300/80 mt-1.5">{error}</p>
            <div className="mt-4">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-4"
              >
                Download / Open File Directly
              </a>
            </div>
          </div>
        ) : (
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="m-auto text-center py-24 flex flex-col items-center justify-center space-y-3">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                <p className="text-xs text-slate-400">Loading document pages...</p>
              </div>
            }
            error={null}
            className="shadow-2xl rounded-lg overflow-hidden border border-slate-800"
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              rotate={rotation}
              renderAnnotationLayer={false}
              renderTextLayer={true}
              onRenderTextLayerSuccess={applyHighlight}
              loading={
                <div className="w-[600px] h-[800px] bg-slate-900/60 animate-pulse flex items-center justify-center text-xs text-slate-500">
                  Rendering page {pageNumber}...
                </div>
              }
              className="bg-white"
            />
          </Document>
        )}

        {/* Cross-Page Continuation Banner */}
        {highlightStatus?.isCrossPage && highlightTarget?.pageEnd && highlightTarget.pageEnd > pageNumber && (
          <div className="sticky bottom-4 mx-auto bg-slate-900/95 border border-amber-500/40 text-amber-200 px-4 py-2 rounded-xl shadow-2xl flex items-center gap-3 backdrop-blur-xl z-20 animate-bounce">
            <span className="text-xs">
              Quote crosses page break and continues on <strong>Page {highlightTarget.pageEnd}</strong>
            </span>
            <Button
              size="sm"
              onClick={() => setPageNumber(highlightTarget.pageEnd!)}
              className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-7 px-2.5 rounded-lg flex items-center gap-1"
            >
              <span>Go to Page {highlightTarget.pageEnd}</span>
              <ArrowRight className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
