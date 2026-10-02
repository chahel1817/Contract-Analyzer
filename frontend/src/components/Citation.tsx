'use client';

import React from 'react';

export interface CitationProps {
  quote?: string;
  pageNumber?: number;
}

export default function Citation({ quote, pageNumber }: CitationProps) {
  return (
    <div>
      <p>{quote}</p>
      {pageNumber && <span>Page {pageNumber}</span>}
    </div>
  );
}
