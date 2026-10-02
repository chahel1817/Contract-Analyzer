'use client';

import React from 'react';

export interface MessageProps {
  role?: string;
  content?: string;
}

export default function Message({ role = 'user', content = '' }: MessageProps) {
  return (
    <div>
      <span>{role}: </span>
      <span>{content}</span>
    </div>
  );
}
