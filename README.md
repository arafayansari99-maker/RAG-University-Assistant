# Athena RAG University Assistant

A university knowledge assistant that lets students and staff ask questions about policies, course catalogs, handbooks, and academic guidelines. Athena retrieves relevant indexed document content, streams answers through Groq, and shows the supporting citations.

## 🎯 Purpose

Athena provides:
- **Research Chat**: Streaming answers with citations, confidence scores, feedback, and export options
- **Chat History**: Create, select, and delete sessions from the shared navigation. New sessions open directly in Research Chat with suggested questions ready to use.
- **Document Library**: Upload PDF, DOCX, and TXT files, inspect chunks, delete documents, and rebuild indexes
- **Admin Insights**: Review document counts, chunk counts, answered questions, confidence, feedback, and top questions

## 📚 Use Cases

1. **Student Information Portal**
   - Query graduation requirements
   - Look up course prerequisites and schedules
   - Find financial aid and scholarship information
   - Access academic policies and procedures

2. **Academic Administration**
   - Help desk for policy inquiries
   - Quick reference for handbook sections
   - Student advisor support tool
   - Document knowledge base

3. **University Knowledge Base**
   - Centralized repository for institutional documents
   - Searchable PDF handbooks and policies
   - Course catalogs and degree requirements
   - Administrative procedures and guidelines

## 🏗️ Architecture

### Frontend (Vite + React)
- **Location**: `artifacts/rag-university/`
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS with Shadcn UI components
- **State Management**: TanStack Query (React Query)
- **Features**:
  - Real-time chat interface with streaming responses
  - Document upload and management
   - Session-based conversation history in the main navigation
   - Four suggested questions on every empty chat session
  - Dark mode support
  - Professional table rendering for structured data
  - Source citations and confidence scoring

### Backend Options

The repository contains two API implementations with the same broad route contract:

#### Express API (local development and Fly.io/Replit)
- **Location**: `artifacts/api-server/`
- **Framework**: Express with TypeScript
- **Database**: PostgreSQL through Drizzle, with a JSON development fallback
- **APIs**: RESTful + Server-Sent Events (SSE)
- **Features**:
   - Asynchronous document processing and structured chunking
   - PostgreSQL full-text, BM25-style, and hashed-vector retrieval
   - OCR and table-aware extraction support
   - LLM integration with Groq

#### FastAPI API (Vercel/Supabase deployment)
- **Location**: `artifacts/api-fastapi/`
- **Framework**: FastAPI with Uvicorn
- **Database**: Supabase PostgreSQL through psycopg
- **APIs**: RESTful + Server-Sent Events (SSE)
- **Features**:
   - Synchronous PDF, DOCX, and TXT extraction
   - PostgreSQL full-text and keyword retrieval
   - LLM integration with Groq
   - Session management and document chunk indexing

### Database
- **Development**: File-based JSON storage (fallback)
- **Production**: Drizzle ORM with PostgreSQL support
- **Schema**: Chat sessions, messages, documents, document chunks

## 🔧 Tech Stack

### Frontend
- **Runtime**: Node.js
- **Framework**: React 18
- **Language**: TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS + Shadcn UI
- **State**: TanStack Query
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Markdown**: React Markdown
- **Theme**: next-themes (Dark Mode)

### Backend
- **Runtime**: Node.js for Express, Python 3.12+ for FastAPI
- **Frameworks**: Express and FastAPI
- **Database**: PostgreSQL/Supabase, Drizzle ORM, and psycopg
- **AI**: Groq SDKs
- **Document parsing**: pdf-parse/pdfjs-dist, pypdf, mammoth, and python-docx

### Package Management
- **Monorepo**: PNPM Workspaces
- **Packages**:
   - `artifacts/api-fastapi` - FastAPI backend
  - `@workspace/rag-university` - React UI frontend
  - `@workspace/api-client-react` - Generated API client
  - `@workspace/api-spec` - OpenAPI specification
  - `@workspace/api-zod` - Zod validation schemas
  - `@workspace/db` - Database schema and migrations

## ✨ Key Features

### Smart Answer Generation
- Retrieves relevant document chunks using the selected backend's text and hybrid retrieval pipeline
- Generates contextual answers using Groq's fast LLM
- Sanitizes markdown artifacts for professional display
- Preserves table structures for data presentation
- Scores answer confidence based on source relevance

### Document Processing
- Supports PDF, DOCX, and TXT formats
- Automatic table detection and preservation
- OCR and table-aware extraction support in the Express backend
- Intelligent chunking for semantic search
- Document metadata tracking

### User Experience
- Real-time streaming responses via SSE
- Chat history with session management in the sidebar below Admin Insights
- New and existing sessions route back to Research Chat when selected
- Empty sessions show four relevant suggested questions
- Source citations with document references
- Professional table rendering in responses
- Dark mode with theme persistence
- Responsive design for mobile and desktop
- Centered text alignment in tables

### Professional Formatting
- Theme-aware colors (light/dark mode)
- Proper heading hierarchy
- Clean bullet point formatting
- No raw markdown artifacts in output
- Readable font sizing and spacing

## 📋 Project Structure

```
RAG-University-Assistant/
├── artifacts/
│   ├── api-fastapi/             # FastAPI backend
│   │   ├── api/index.py         # Vercel Python entrypoint
│   │   ├── app/main.py          # FastAPI routes and SSE chat
│   │   └── requirements.txt     # Python dependencies
│   │
│   ├── api-server/              # Legacy Express backend
│   │   ├── src/
│   │   │   ├── app.ts          # Express app setup
│   │   │   ├── index.ts        # Server entry point
│   │   │   ├── lib/
│   │   │   │   ├── groq.ts     # LLM integration
│   │   │   │   ├── rag.ts      # Semantic search & chunking
│   │   │   │   └── logger.ts   # Logging
│   │   │   └── routes/
│   │   │       ├── chat.ts     # Chat endpoint (SSE)
│   │   │       └── documents.ts # Document management
│   │   └── build.mjs           # esbuild configuration
│   │
│   ├── rag-university/          # React frontend
│   │   ├── src/
│   │   │   ├── main.tsx        # App entry point
│   │   │   ├── App.tsx         # Root component
│   │   │   ├── index.css       # Theme & styling
│   │   │   ├── pages/
│   │   │   │   ├── chat.tsx    # Chat interface (Table rendering)
│   │   │   │   ├── documents.tsx # Document upload
│   │   │   │   └── admin.tsx   # Analytics dashboard
│   │   │   └── components/     # Reusable UI components
│   │   └── vite.config.ts      # Vite configuration
│   │
│   └── mockup-sandbox/          # UI component showcase
│
├── lib/
│   ├── api-spec/                # OpenAPI specification
│   ├── api-client-react/        # Generated API client
│   ├── api-zod/                 # Zod validation schemas
│   └── db/                      # Drizzle ORM schema
│
├── scripts/                     # Utility scripts
├── package.json                 # Root workspace config
├── pnpm-workspace.yaml          # PNPM monorepo config
└── tsconfig.base.json           # Base TypeScript config
```

## 🔐 Security

- **API Key Protection**: Groq API key stored only on backend
- **CORS Enabled**: Safe cross-origin requests
- **Environment Variables**: Sensitive config via env vars
- **Input Validation**: Zod schemas for request validation
- **Rate Limiting**: Express rate limit middleware support

## 🛠️ Development

### Prerequisites
- Node.js 18+
- PNPM (package manager)
- Groq API key (free tier available at console.groq.com)

### Local Setup

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start the local API**
   The frontend defaults to `http://localhost:3001`. The Express API can use its JSON fallback without PostgreSQL, but Groq and database-backed features require the relevant environment variables.
   ```powershell
   cd artifacts/api-server
   pnpm run build
   $env:PORT="3001"
   $env:CORS_ORIGINS="http://localhost:5173"
   pnpm run start
   ```

3. **Configure the FastAPI option when deploying to Supabase/Vercel**
   ```bash
   cd artifacts/api-fastapi
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

4. **Run the UI in a second terminal**
     ```bash
     cd artifacts/rag-university
     pnpm run dev
     ```

5. **Open in browser**
   ```
   http://localhost:5173
   ```

### Build for Production

```bash
# Build API
cd artifacts/api-fastapi
pip install -r requirements.txt

# Build UI
cd artifacts/rag-university
VITE_API_BASE=https://your-api-url pnpm run build

# Output: artifacts/rag-university/dist/public
```

## 📊 API Endpoints

### Chat
- `POST /api/chat/ask` - Submit question and get streaming response (SSE)
- `GET /api/chat/sessions` - List chat sessions
- `POST /api/chat/sessions` - Create a chat session
- `GET /api/chat/sessions/:sessionId/messages` - Get conversation history
- `DELETE /api/chat/sessions/:sessionId` - Delete a chat session
- `POST /api/chat/messages/:messageId/feedback` - Submit answer feedback

### Documents
- `POST /api/documents` - Upload document
- `GET /api/documents` - List all documents
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/rebuild-index` - Rebuild search index

### Analytics
- `GET /api/analytics/stats` - Get platform statistics
- `GET /api/analytics/top-questions` - Get trending questions

### Health
- `GET /api/healthz` - Health check endpoint

## 🎓 Learning Resources

- **Document Retrieval**: Combines PostgreSQL full-text/keyword retrieval with the Express backend's hybrid scoring pipeline
- **RAG Pattern**: Combines retrieval with LLM generation for accurate answers
- **Streaming Responses**: Server-Sent Events (SSE) for real-time answer delivery
- **Monorepo Architecture**: PNPM workspaces for scalable multi-package projects
- **Table Rendering**: Smart HTML table generation from markdown/pipe-delimited data

## 📚 Project Documentation

- [FastAPI + Supabase + Vercel deployment guide](docs/DEPLOYMENT_FASTAPI_SUPABASE_VERCEL.md)
- [Future add-ons roadmap](docs/FUTURE_ADDONS.md)
- [Vercel + Fly.io deployment guide](docs/DEPLOYMENT_VERCEL_FLY.md)
- [Vercel + Replit deployment guide](docs/DEPLOYMENT_VERCEL_REPLIT.md)
- [Deployment quick start](docs/DEPLOYMENT_QUICK_START.md)
- [Vercel + Replit quick start](docs/DEPLOYMENT_VERCEL_REPLIT_QUICK.md)

## 📝 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📞 Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation
- Review API examples in the codebase

---

**Built with ❤️ for university students and staff**
