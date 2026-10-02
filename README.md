# Contract Analyzer

An AI-powered contract analysis, extraction, citation, and comparison platform.

## Architecture

```text
contract-analyzer/
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx
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

## Getting Started

### Prerequisites
- Node.js >= 18
- PostgreSQL database

### 1. Backend Setup
```bash
cd backend
npm install
# configure .env with DATABASE_URL and OPENAI_API_KEY
npx prisma generate
npm run dev
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.
