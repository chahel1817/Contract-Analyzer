'use client';

import React from 'react';

export interface PdfViewerProps {
  url?: string;
}

export default function PdfViewer({ url }: PdfViewerProps) {
  return (
    <div>
      <h3>PDF Viewer</h3>
      {url && <p>Viewing: {url}</p>}
    </div>
  );
}
