# Contract Analyzer

An AI-powered legal contract analysis, extraction, citation verification, and clause-level comparison platform.

## Architecture

```text
contract-analyzer/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── dashboard/
│   │   │   ├── documents/
│   │   │   ├── chat/
│   │   │   └── compare/
│   │   ├── components/
│   │   │   ├── DocumentUpload.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   ├── Chat.tsx
│   │   │   ├── Message.tsx
│   │   │   ├── Citation.tsx
│   │   │   ├── PdfViewer.tsx
│   │   │   └── Comparison.tsx
│   │   └── lib/
│   │       └── api.ts
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── document.controller.ts
│   │   │   ├── chat.controller.ts
│   │   │   └── comparison.controller.ts
│   │   ├── routes/
│   │   │   ├── document.routes.ts
│   │   │   ├── chat.routes.ts
│   │   │   └── comparison.routes.ts
│   │   ├── services/
│   │   │   ├── document.service.ts
│   │   │   ├── extraction.service.ts
│   │   │   ├── retrieval.service.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── citation.service.ts
│   │   │   └── comparison.service.ts
│   │   ├── middleware/
│   │   │   ├── upload.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── utils/
│   │   │   ├── prisma.ts
│   │   │   └── index.ts
│   │   └── server.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── uploads/
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
│
├── .gitignore
└── README.md
```

## Features

### 1. Document Management & Extraction
- Support for `.pdf` and `.docx` legal agreements.
- Scanned PDF detection and graceful rejection.
- Text layer extraction and semantic chunking with sliding window.

### 2. Verified Citations & Document Viewer
- Verbatim quote verification against original document text (`citation.service.ts`).
- Interactive PDF viewer (`react-pdf`) with text layer citation highlighting.
- Handles multi-line, cross-page, and duplicate quotes.
- Clicking a verified citation card automatically scrolls and highlights the excerpt in the contract.

### 3. Multi-Document Chat & Streaming RAG
- Multi-document selection and cross-contract question answering.
- Real-time Server-Sent Events (SSE) streaming with Stop generation capability.
- Chat history persistence saved per document.

### 4. Phase 8 — Clause-Level Contract Comparison
- **Clause/Paragraph-Level Comparison**: Rather than a simple character diff, the engine parses contracts into distinct legal clauses and pairs corresponding provisions.
- **Substantive Impact Detection**: Distinguishes superficial rewording from high-impact business alterations:
  - Financial terms and monetary liability caps (e.g. `AED 100,000` $\rightarrow$ `AED 1,000,000`).
  - Notice periods and deadlines (e.g. `60 days notice` $\rightarrow$ `5 days notice`).
  - Critical risk provisions (indemnity, consequential damages, governing law, termination rights).
- **Significance Classification**: Flags changes as **High**, **Medium**, or **Low** significance.
- **Plain-Language Summaries**: Generates executive summaries and per-clause plain-language explanations of what changed in substance.
- **Comparison UI (`/compare`)**:
  - Select Version 1 and Version 2 with one-click swap.
  - Filter by significance (`High`, `Medium`, `Low`) and change type (`Modified`, `Added`, `Removed`).
  - Sort by significance or document order.
  - Side-by-Side and Unified stacked views with old vs new text diffs.

## API Endpoints

### Comparison API
- **`POST /api/comparison`**
  - **Input**:
    ```json
    {
      "documentA": "doc-uuid-1",
      "documentB": "doc-uuid-2"
    }
    ```
  - **Output**:
    ```json
    {
      "success": true,
      "executiveSummary": "Comparative analysis summary...",
      "totalChanges": 6,
      "counts": {
        "high": 4,
        "medium": 1,
        "low": 1,
        "added": 1,
        "removed": 1,
        "modified": 4
      },
      "comparisons": [
        {
          "clause": "4. LIMITATION OF LIABILITY",
          "oldText": "Vendor's aggregate liability shall not exceed AED 100,000...",
          "newText": "Vendor's aggregate liability shall not exceed AED 1,000,000...",
          "summary": "Financial terms in \"4. LIMITATION OF LIABILITY\" changed from AED 100,000 to AED 1,000,000.",
          "significance": "High",
          "changeType": "modified"
        }
      ]
    }
    ```

### 5. Phase 9 — Large Document Strategy (100–150 Pages)
- **Large Document Processing**: Handles large 100–150+ page enterprise contracts without memory bottlenecks.
- **RAG vs Context Bloat**: Avoids sending the entire 150-page document to the LLM (which would cause context overflow, high cost, and hallucination).
- **Sub-5% Context Ratio**: Only the top relevant retrieved chunks (< 1% of total document text) are injected into the prompt.
- **Deep Page Coordinate Resolution**: Verified citations accurately pinpoint quotes located on deep pages (e.g., page 112) with exact character offsets.

## Getting Started

### Prerequisites
- Node.js >= 18
- PostgreSQL database

### 1. Backend Setup
```bash
cd backend
npm install
# configure .env with DATABASE_URL and AI_API_KEY
npx prisma generate
npx prisma db push
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

### 3. Automated Test Suites
Run in `backend/`:
```bash
npm run test:db           # PostgreSQL connection & model test
npm run test:retrieval    # Chunk retrieval & scoring test
npm run test:ai           # AI service & fallback generation test
npm run test:citation     # Verbatim quote verification test
npm run test:chat         # Chat API & SSE streaming test
npm run test:persistence  # Chat persistence test
npm run test:highlight    # Citation offset & text layer test
npm run test:multi-doc    # Multi-document selection & chat test
npm run test:comparison   # Phase 8: Contract clause comparison test
npm run test:large-doc    # Phase 9: 100-150 page large document test
```
