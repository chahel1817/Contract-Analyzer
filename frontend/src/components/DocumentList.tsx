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
  FileCheck,
  Loader2,
  Eye,
  GitCompare,
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
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" />
            Ready
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse">
            <Clock className="w-3 h-3 animate-spin" />
            Processing...
          </span>
        );
      case 'FAILED':
        return (
          <span
            title={errorMessage || 'Processing failed'}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 cursor-help"
          >
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-2xl">
      {/* Header and Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-indigo-400" />
            Contract Library
            <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {documents.length} {documents.length === 1 ? 'file' : 'files'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage your uploaded contracts, indexed chunks, and AI analysis status
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contracts..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-950/60 border border-slate-800 focus:border-indigo-500/60 rounded-xl text-slate-200 placeholder-slate-500 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Loading Skeleton / Spinner */}
      {isLoading && documents.length === 0 && (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm">Loading contract library...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredDocs.length === 0 && (
        <div className="py-16 text-center border-2 border-dashed border-slate-800/80 rounded-xl bg-slate-950/20">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-300">
            {searchQuery ? 'No matching contracts found' : 'No contracts uploaded yet'}
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
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
                className="group p-4 bg-slate-950/40 hover:bg-slate-800/40 border border-slate-800/80 hover:border-slate-700 rounded-xl transition-all duration-150 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* File info */}
                <div className="flex items-start space-x-3.5 overflow-hidden">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isPdf
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                    }`}
                  >
                    <FileText className="w-5 h-5" />
                  </div>

                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition-colors">
                        {doc.title || doc.fileName}
                      </h4>
                      {renderStatusBadge(doc.status, doc.errorMessage)}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5 flex-wrap">
                      <span className="text-slate-500">{doc.fileName}</span>
                      <span>•</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      {doc.pageCount && (
                        <>
                          <span>•</span>
                          <span>{doc.pageCount} {doc.pageCount === 1 ? 'page' : 'pages'}</span>
                        </>
                      )}
                      {doc._count && doc._count.chunks !== undefined && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Layers className="w-3 h-3 text-indigo-400" />
                            {doc._count.chunks} chunks
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span className="flex items-center gap-1 text-slate-500">
                        <Calendar className="w-3 h-3" />
                        {formatDate(doc.createdAt)}
                      </span>
                    </div>

                    {/* Scanned / Error note if FAILED */}
                    {doc.status === 'FAILED' && doc.errorMessage && (
                      <p className="text-xs text-rose-400/90 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        {doc.errorMessage}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <Link href={`/documents/${doc.id}`}>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white text-xs h-8 px-2.5 rounded-lg flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5 text-indigo-400" />
                      View
                    </Button>
                  </Link>

                  {isReady && (
                    <>
                      <Link href={`/chat?docId=${doc.id}`}>
                        <Button
                          size="sm"
                          className="bg-indigo-600/90 hover:bg-indigo-600 text-white text-xs h-8 px-3 rounded-lg flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Chat
                        </Button>
                      </Link>
                      <Link href={`/compare?docA=${doc.id}`}>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-slate-800 hover:border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white text-xs h-8 px-2.5 rounded-lg flex items-center gap-1.5"
                        >
                          <GitCompare className="w-3.5 h-3.5 text-purple-400" />
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
                    className="text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 h-8 px-2.5 rounded-lg transition-colors"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
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
