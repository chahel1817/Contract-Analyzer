'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { DocumentItem, deleteDocument } from '@/lib/api';
import {
  FileText,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Search,
  Layers,
  Calendar,
  Loader2,
  Eye,
  GitCompare,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentListProps {
  documents: DocumentItem[];
  isLoading: boolean;
  onDocumentDeleted?: (id: string) => void;
  onRefresh?: () => void;
}

export default function DocumentList({
  documents,
  isLoading,
  onDocumentDeleted,
  onRefresh,
}: DocumentListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredDocs = documents.filter((doc) => {
    const q = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(q) ||
      doc.fileName.toLowerCase().includes(q) ||
      doc.status.toLowerCase().includes(q)
    );
  });

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? All associated indexed chunks and chat history will be removed.`)) {
      return;
    }

    setDeletingId(id);
    try {
      const res = await deleteDocument(id);
      if (res.success) {
        if (onDocumentDeleted) onDocumentDeleted(id);
        if (onRefresh) onRefresh();
      } else {
        alert(res.error || 'Failed to delete document');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting document');
    } finally {
      setDeletingId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const renderStatusBadge = (status: string, errorMessage?: string | null) => {
    switch (status?.toUpperCase()) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Ready
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
            Processing
          </span>
        );
      case 'FAILED':
        return (
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
            title={errorMessage || 'Processing failed'}
          >
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
            <Clock className="w-3 h-3 text-neutral-400" />
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-neutral-500 font-medium">
          Showing <span className="font-bold text-neutral-900">{filteredDocs.length}</span> of {documents.length} contracts
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search contracts by title, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-200/90 rounded-xl text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50 shadow-2xs"
          />
        </div>
      </div>

      {/* Loading Skeleton */}
      {isLoading && documents.length === 0 && (
        <div className="py-16 text-center text-neutral-400 flex flex-col items-center justify-center space-y-3 bg-white rounded-2xl border border-neutral-200">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm font-medium">Loading contract library...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredDocs.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-neutral-200 rounded-3xl bg-white p-6">
          <FileText className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-neutral-800">
            {searchQuery ? 'No matching contracts found' : 'No contracts uploaded yet'}
          </h3>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? 'Try modifying your search terms.'
              : 'Upload a contract agreement above to start extracting clauses and querying with verified citations.'}
          </p>
        </div>
      )}

      {/* Document Grid / Cards */}
      {filteredDocs.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {filteredDocs.map((doc) => {
            const isPdf = doc.fileName.toLowerCase().endsWith('.pdf');
            const isReady = doc.status?.toUpperCase() === 'READY';
            const isDeleting = deletingId === doc.id;

            return (
              <div
                key={doc.id}
                className="group p-4 bg-white hover:bg-neutral-50/80 border border-neutral-200/90 hover:border-neutral-300 rounded-2xl transition-all shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* File info */}
                <div className="flex items-start space-x-3.5 overflow-hidden">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isPdf
                        ? 'bg-rose-50 border-rose-200 text-rose-500'
                        : 'bg-blue-50 border-blue-200 text-blue-500'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>

                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-neutral-900 truncate group-hover:text-amber-600 transition-colors">
                        {doc.title || doc.fileName}
                      </h4>
                      {renderStatusBadge(doc.status, doc.errorMessage)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 flex-wrap">
                      <span className="text-neutral-400">{doc.fileName}</span>
                      <span>&bull;</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.pageCount && (
                        <>
                          <span>&bull;</span>
                          <span>{doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}</span>
                        </>
                      )}
                      {doc._count && doc._count.chunks !== undefined && (
                        <>
                          <span>&bull;</span>
                          <span className="flex items-center gap-1 font-medium text-neutral-600">
                            <Layers className="w-3 h-3 text-amber-500" />
                            {doc._count.chunks} chunks
                          </span>
                        </>
                      )}
                      <span>&bull;</span>
                      <span className="flex items-center gap-1 text-neutral-400">
                        <Calendar className="w-3 h-3" />
                        {formatDate(doc.createdAt)}
                      </span>
                    </div>

                    {/* Error note if FAILED */}
                    {doc.status === 'FAILED' && doc.errorMessage && (
                      <p className="text-xs text-rose-600 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {doc.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  {/* Talk to Anna */}
                  {isReady && (
                    <Link href={`/assistant?docId=${doc.id}`}>
                      <Button
                        size="sm"
                        className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold text-xs h-8 px-3 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600 fill-current" />
                        <span>Talk to Anna</span>
                      </Button>
                    </Link>
                  )}

                  <Link href={`/documents/${doc.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700 hover:text-neutral-900 text-xs h-8 px-2.5 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-neutral-500" />
                      View
                    </Button>
                  </Link>

                  {isReady && (
                    <>
                      <Link href={`/chat?docId=${doc.id}`}>
                        <Button
                          size="sm"
                          className="bg-neutral-900 hover:bg-black text-white text-xs h-8 px-3 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Chat
                        </Button>
                      </Link>
                      <Link href={`/compare?docA=${doc.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-neutral-200 hover:border-neutral-300 bg-white text-neutral-700 hover:text-neutral-900 text-xs h-8 px-2.5 rounded-xl flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <GitCompare className="w-3.5 h-3.5 text-indigo-500" />
                          Compare
                        </Button>
                      </Link>
                    </>
                  )}

                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(doc.id, doc.title || doc.fileName)}
                    disabled={isDeleting}
                    className="text-neutral-400 hover:text-rose-600 hover:bg-rose-50 h-8 px-2.5 rounded-xl transition-colors cursor-pointer"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
