'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MarkdownAnswerProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

export default function MarkdownAnswer({
  content,
  isStreaming = false,
  className = '',
}: MarkdownAnswerProps) {
  if (!content && !isStreaming) return null;

  return (
    <div className={`prose-answer text-neutral-900 text-sm leading-relaxed ${className}`}>
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="my-2 leading-relaxed text-neutral-850 text-sm font-normal">
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-neutral-950">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-neutral-800">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 my-2.5 pl-5 list-disc marker:text-amber-500 text-sm text-neutral-850">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1.5 my-2.5 pl-5 list-decimal marker:text-amber-600 marker:font-semibold text-sm text-neutral-850">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="text-sm text-neutral-850 leading-relaxed pl-0.5">
              {children}
            </li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 pl-3.5 border-l-[3px] border-amber-500 bg-amber-50/70 py-2 pr-3.5 rounded-r-xl italic text-xs text-neutral-800 font-serif leading-relaxed shadow-2xs [&>p]:my-0.5 [&>p]:leading-relaxed">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => (
            <h3 className="text-base font-bold text-neutral-900 mt-4 mb-2 flex items-center gap-1.5 tracking-tight">
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h4 className="text-xs font-bold text-amber-950 mt-3 mb-1.5 uppercase tracking-wide">
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5 className="text-xs font-bold text-neutral-800 mt-2.5 mb-1">
              {children}
            </h5>
          ),
          code: ({ children }) => (
            <code className="font-mono text-xs bg-neutral-100 text-amber-900 px-1.5 py-0.5 rounded border border-neutral-200">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-xl border border-neutral-200 shadow-2xs">
              <table className="w-full text-xs text-left border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-neutral-50 text-neutral-900 font-bold border-b border-neutral-200">
              {children}
            </thead>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 font-bold text-neutral-900">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-t border-neutral-100 text-neutral-700">
              {children}
            </td>
          ),
          hr: () => <hr className="my-3 border-t border-neutral-200" />,
        }}
      >
        {content}
      </ReactMarkdown>

      {isStreaming && (
        <span className="inline-block w-2 h-4 ml-1 bg-amber-500 animate-pulse align-middle" />
      )}
    </div>
  );
}
