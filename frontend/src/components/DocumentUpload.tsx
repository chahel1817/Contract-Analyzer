'use client';

import React, { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { uploadDocument, DocumentItem } from '@/lib/api';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DocumentUploadProps {
  onUploadSuccess?: (doc: DocumentItem) => void;
}

export default function DocumentUpload({ onUploadSuccess }: DocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedExtensions = ['.pdf', '.docx'];

  const validateFile = (file: File): boolean => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      setErrorMessage(`Invalid file format "${ext}". Only PDF and DOCX documents are accepted.`);
      setSelectedFile(null);
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 50MB maximum limit.');
      setSelectedFile(null);
      return false;
    }
    setErrorMessage(null);
    return true;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file && validateFile(file)) {
        setSelectedFile(file);
        setSuccessMessage(null);
      }
    }
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file && validateFile(file)) {
        setSelectedFile(file);
        setSuccessMessage(null);
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const result = await uploadDocument(selectedFile);

      if (result.success && result.data) {
        setSuccessMessage(`"${result.data.title || result.data.fileName}" uploaded successfully and indexed.`);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (onUploadSuccess) onUploadSuccess(result.data);
      } else {
        setErrorMessage(result.error || 'Failed to upload document. Please check file format.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs transition-all">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-amber-500" />
            Upload Contract Document
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Supported formats: <span className="text-amber-700 font-semibold">PDF, DOCX</span> (up to 50MB per contract)
          </p>
        </div>
      </div>

      {/* Drag & Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragging
            ? 'border-amber-500 bg-amber-50/40 scale-[1.005]'
            : 'border-neutral-200 hover:border-amber-400 bg-[#fbfbfb] hover:bg-amber-50/20'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          onChange={handleFileSelect}
          className="hidden"
          disabled={isUploading}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-600 transition-transform">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800">
              <span className="text-amber-600 underline underline-offset-4">Click to browse</span> or drag and drop your contract here
            </p>
            <p className="text-xs text-neutral-400 mt-1">Automatic clause chunking, page indexing & quote verification</p>
          </div>
        </div>
      </div>

      {/* Selected File Card */}
      {selectedFile && (
        <div className="mt-4 p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl flex items-center justify-between animate-in fade-in">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-amber-600" />
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold text-neutral-900 truncate">{selectedFile.name}</p>
              <p className="text-xs text-neutral-400">{formatFileSize(selectedFile.size)}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {!isUploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="p-1.5 hover:bg-neutral-200/60 rounded-lg text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <Button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleUpload();
              }}
              disabled={isUploading}
              className="bg-neutral-900 hover:bg-black text-white font-semibold text-xs px-4 h-9 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting Clauses...
                </>
              ) : (
                'Upload & Extract'
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-2.5 text-rose-700 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold block text-rose-800">Upload / Processing Error:</span>
            {errorMessage}
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-400 hover:text-rose-700 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Success Banner */}
      {successMessage && (
        <div className="mt-4 p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-800 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="flex-1 font-semibold">{successMessage}</span>
          <button
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-800 p-0.5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
