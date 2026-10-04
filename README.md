# Contract Analyzer

An enterprise-grade legal contract analysis, extraction, citation verification, and clause-level comparison platform.

### 🌐 Live Production Deployment
- **Frontend Web Application (Vercel):** [https://contract-analyzer-gules.vercel.app](https://contract-analyzer-gules.vercel.app/dashboard)
- **Backend API Service (Render):** [https://contract-analyzer-nvt5.onrender.com](https://contract-analyzer-nvt5.onrender.com)
- **GitHub Repository:** [https://github.com/chahel1817/Contract-Analyzer](https://github.com/chahel1817/Contract-Analyzer)
- **Database Infrastructure:** Neon Serverless PostgreSQL

---

## What the App Does

Contract Analyzer is a production-grade legal intelligence workspace designed to review complex commercial agreements with **zero hallucination** and **character-accurate citation verification**:

1. **Document Ingestion & Semantic Chunking**: Ingests `.pdf` and `.docx` contracts, performs page-aware text extraction with sliding-window chunking, and indexes clauses with persistent character offset mappings.
2. **Deterministic & AI-Assisted Q&A with Verified Citations**: Answers complex legal queries using Server-Sent Events (SSE) streaming. Every legal claim is linked to a verbatim citation card that is verified character-by-character against the raw contract text before being displayed.
3. **Interactive PDF Split-Screen Highlighting**: Clicking any verified citation pill automatically navigates the PDF canvas to the exact page, scrolls to the text, and renders high-visibility highlights across single or multi-line excerpts.
4. **Substantive Clause Comparison Engine (`/compare`)**: Aligns provisions between two contract versions and identifies high-impact legal differences (financial liability caps, notice periods, indemnity carve-outs, governing law) classified by **High**, **Medium**, and **Low** significance.
5. **Part C: Autonomous Research Agent (`/agent`)**: An autonomous agent executing multi-round investigative research trajectories (`list_clauses` $\rightarrow$ `search_document` $\rightarrow$ `get_section` $\rightarrow$ `final_answer`) with reasoning traces and verified citations.

---

## Application Screenshots

### 1. Document Upload & Library (`/dashboard`)
*Upload contracts with real-time status tracking, chunk topology, and document management.*
![Document Upload and Dashboard](docs/screenshots/01-upload-dashboard.png)

---

### 2. Chat with Verified Citations (`/documents/[id]/chat`)
*Real-time streaming answers backed exclusively by verified citation cards with exact character offsets.*
![Chat with Verified Quotes](docs/screenshots/02-chat-verified-quotes.png)

---

### 3. Interactive Split-Screen Citation Highlighting
*Clicking any citation navigates the viewer to the exact page and highlights the source excerpt.*
![Citation Highlighting in PDF](docs/screenshots/03-citation-highlighting.png)

---

### 4. Clause-Level Contract Comparison (`/compare`)
*Semantic diff engine highlighting substantive changes, financial liability shifts, and risk levels.*
![Clause-Level Document Comparison](docs/screenshots/04-document-comparison.png)

---

### 5. Part C: Autonomous Research Agent (`/agent`)
*Multi-round autonomous research trajectory with step-by-step reasoning, tool invocations, and quote verification.*
![Part C Autonomous Research Agent](docs/screenshots/05-part-c-agent.png)

---

## Project Architecture

```text
contract-analyzer/
├── frontend/                     # Next.js 16 (App Router) + Tailwind CSS + Radix UI
│   ├── src/
│   │   ├── app/
│   │   │   ├── dashboard/        # Contract library & upload dropzone
│   │   │   ├── documents/[id]/   # Full-page PDF & extracted text viewer
│   │   │   ├── documents/[id]/chat/ # Split-screen chat & citation highlighting
│   │   │   ├── chat/             # Multi-contract synthesis chat
│   │   │   ├── compare/          # Clause-level contract comparison engine
│   │   │   └── agent/            # Part C: Autonomous research agent console
│   │   ├── components/
│   │   │   ├── PdfViewer.tsx     # react-pdf canvas with DOM text-layer highlighter
│   │   │   └── ui/               # Design system & accessible components
│   │   └── lib/api.ts            # Client-side API layer
│   └── package.json
│
├── backend/                      # Node.js + Express + TypeScript + Prisma ORM
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── document.controller.ts   # Ingestion, file streaming & PDF synthesis
│   │   │   ├── chat.controller.ts       # SSE streaming RAG & quote verification
│   │   │   ├── comparison.controller.ts # Clause pairing & significance scoring
│   │   │   └── agent.controller.ts      # Multi-round autonomous research agent
│   │   ├── services/
│   │   │   ├── chunking.service.ts      # Sliding-window & heading boundary chunker
│   │   │   ├── extraction.service.ts    # PDF & DOCX text layer extraction
│   │   │   ├── retrieval.service.ts     # Okapi BM25 & phrase density reranking
│   │   │   ├── citation.service.ts      # Exact substring verification & offsets
│   │   │   ├── comparison.service.ts    # Substantive contract difference analyzer
│   │   │   ├── agent.service.ts         # Autonomous 5-round tool-calling loop
│   │   │   └── ai.service.ts            # Triple-tier generation & fallback engine
│   │   └── server.ts
│   ├── prisma/schema.prisma      # PostgreSQL schema (Document, Chunk, Conversation, Message)
│   └── package.json
│
└── docs/screenshots/             # Production UI walkthrough captures
```

---

## How to Run Locally

### Prerequisites
- **Node.js**: `>= 18.0.0`
- **PostgreSQL**: Running locally or a cloud connection string (e.g. Neon, Supabase)
- **npm**: `>= 9.0.0`

### 1. Database & Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env
```

Configure `backend/.env` with your credentials:
```env
PORT=5000
DATABASE_URL="postgresql://username:password@localhost:5432/contract_analyzer?schema=public"
AI_BASE_URL="https://openrouter.ai/api/v1"
AI_API_KEY="your-openrouter-or-openai-api-key"
AI_MODEL="openrouter/free"
UPLOAD_DIR="./uploads"
CORS_ORIGIN="http://localhost:3000"
```

Initialize the database schema and start the API server:
```bash
# Push Prisma schema to PostgreSQL
npx prisma db push

# Start development server
npm run dev
```
The backend API will start on `http://localhost:5000`.

### 2. Frontend Setup

```bash
# In a new terminal, navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Create environment configuration
cp .env.example .env.local
```

Configure `frontend/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Start the Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Automated Verification Test Suites

The backend includes comprehensive test suites covering all benchmark gates, edge cases, and comparative workflows:

```bash
cd backend
npm run test:citation    # Verbatim quote verification & character offset matching
npm run test:retrieval   # Okapi BM25 scoring & heading alignment
npm run test:ai          # Triple-tier LLM generation & deterministic fallback
npm run test:chat        # SSE real-time streaming & persistence
npm run test:multi-doc   # Multi-contract selection & attributed synthesis
npm run test:comparison # Clause diff detection & financial significance scoring
npm run test:large-doc   # 100–150 page large document memory & coordinate tests
npm run test:agent       # Part C: Autonomous 5-round agentic research trajectory
npm run test:errors      # 9-scenario error resilience & graceful failure tests
```

---

## What Is Finished and What Is Not

To provide complete transparency regarding the current state of implementation:

### ✅ Finished & Fully Functional

#### Part A: Core Ingestion, RAG & Citation Verification
- [x] **Document Ingestion**: Upload of `.pdf` and `.docx` contracts with file validation.
- [x] **Sliding-Window Chunking**: Splits text into ~1000-character segments with 150-character overlaps, preserving sentence boundaries and section metadata.
- [x] **Okapi BM25 Retrieval**: Term frequency, inverse document frequency (IDF), query token stemming, and bigram proximity boosting across any contract structure.
- [x] **Character-Accurate Quote Verification**: Verifies candidate quotes character-for-character against the raw document, outputting exact `[startIndex..endIndex]` ranges and `pageStart` coordinates.
- [x] **Evidence Sufficiency Gate (Zero Hallucination)**: Automatically intercepts questions when evidence is absent in the document, returning *"The contract does not specify the requested information."* with 0 citations.
- [x] **Real-Time Streaming**: Server-Sent Events (SSE) streaming answers with immediate citation card generation.
- [x] **Cloud PDF Persistence**: Built-in on-demand PDF synthesis (`pdf-lib`) reconstructing valid PDFs if ephemeral cloud containers restart.

#### Part B: Interactive Highlighting & Contract Comparison
- [x] **Split-Screen Citation Highlighting**: Direct text-layer DOM highlights rendered on the PDF canvas with active quote banners and jump-to-page controls.
- [x] **Text View Fallback**: Segmented `[ PDF View | Text View ]` toggle ensuring readability across devices.
- [x] **Clause-Level Contract Comparison (`/compare`)**: Aligns provisions between two agreements, detecting substantive differences (monetary caps, notice periods, risk shifts) classified by **High**, **Medium**, and **Low** significance with executive summaries.
- [x] **Multi-Document Synthesis (`/chat`)**: Allows selecting multiple contracts and querying across them with document-attributed citations.

#### Part C: Autonomous Document Research Agent (Option 2)
- [x] **5-Round Tool-Calling Loop**: Autonomous agent implementing `list_clauses`, `search_document`, `get_section`, and `final_answer`.
- [x] **Loop Safety & Malformed Call Interception**: Guardrails preventing infinite execution and recovering from malformed tool outputs.
- [x] **Verbatim Quote Verification on Agent Outputs**: All synthesized conclusions are validated against the source text before presentation.

---

### ⚠️ What Is Not Finished / Current Limitations

1. **Scanned Image OCR**: Documents that are pure scanned bitmaps without an embedded text layer are detected and gracefully rejected with a notification that OCR is required. Full OCR pipeline integration (e.g., Tesseract / AWS Textract) is left for future work.
2. **Visual Bounding-Box Overlays**: Highlighting is implemented via the PDF text layer using DOM ranges. Exact geometric vector bounding-box drawing (`x, y, w, h`) on canvas is not implemented.
3. **Complex Nested Tables in PDF**: Complex multi-column financial tables are extracted as plain text lines rather than converted into structured tabular JSON grids.
