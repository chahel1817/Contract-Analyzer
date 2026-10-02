'use client';

import React from 'react';

export interface ComparisonProps {
  documentAId?: string;
  documentBId?: string;
}

export default function Comparison({ documentAId, documentBId }: ComparisonProps) {
  return (
    <div>
      <h3>Contract Comparison</h3>
      <p>Comparing: {documentAId} vs {documentBId}</p>
    </div>
  );
}
