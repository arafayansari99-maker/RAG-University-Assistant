# RAG University Assistant

A modern Retrieval-Augmented Generation (RAG) application designed to help university students and staff find answers to academic questions by searching through university documents, policies, and handbooks.

## 🎯 Purpose

The RAG University Assistant streamlines access to university information by:
- **Intelligent Search**: Uses semantic search to find relevant information across university documents
- **Quick Answers**: Generates accurate, source-backed answers using Groq's fast LLM inference
- **Professional Formatting**: Presents answers in clean, readable tables and structured text
- **Document Management**: Organizes and indexes university materials for efficient retrieval

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
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS with Shadcn UI components
- **State Management**: TanStack Query (React Query)
- **Features**:
  - Real-time chat interface with streaming responses
  - Document upload and management
  - Session-based conversation history
  - Dark mode support
  - Professional table rendering for structured data
  - Source citations and confidence scoring

### Backend (Express.js + TypeScript)
- **Location**: `artifacts/api-server/`
- **Framework**: Express 5 with Node.js
- **APIs**: RESTful + Server-Sent Events (SSE)
- **Features**:
  - Document processing (PDF, DOCX, TXT)
  - Vector embeddings and semantic search
  - LLM integration with Groq
  - Session management
  - Document chunk indexing

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
- **Runtime**: Node.js
- **Framework**: Express 5
- **Language**: TypeScript
- **Database**: Drizzle ORM + PostgreSQL
- **AI**: Groq LLM (openai/gpt-oss-20b)
- **PDF**: pdf-parse + pdfjs-dist
- **OCR**: Tesseract.js
- **DOCX**: Mammoth
- **Logging**: Pino
- **Build**: esbuild

### Package Management
- **Monorepo**: PNPM Workspaces
- **Packages**:
  - `@workspace/api-server` - Express API backend
  - `@workspace/rag-university` - React UI frontend
  - `@workspace/api-client-react` - Generated API client
  - `@workspace/api-spec` - OpenAPI specification
  - `@workspace/api-zod` - Zod validation schemas
  - `@workspace/db` - Database schema and migrations

## ✨ Key Features

### Smart Answer Generation
- Retrieves relevant document chunks using semantic search
- Generates contextual answers using Groq's fast LLM
- Sanitizes markdown artifacts for professional display
- Preserves table structures for data presentation
- Scores answer confidence based on source relevance

### Document Processing
- Supports PDF, DOCX, and TXT formats
- Automatic table detection and preservation
- OCR support for scanned documents
- Intelligent chunking for semantic search
- Document metadata tracking

### User Experience
- Real-time streaming responses via SSE
- Chat history with session management
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
│   ├── api-server/              # Express backend
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

2. **Configure environment**
   ```bash
   cd artifacts/api-server
   cp .env.example .env
   # Add your GROQ_API_KEY to .env
   ```

3. **Run in development**
   - **Terminal 1 - API Server**
     ```bash
     cd artifacts/api-server
     pnpm run build
     pnpm run start
     ```
   
   - **Terminal 2 - UI Dev Server**
     ```bash
     cd artifacts/rag-university
     pnpm run dev
     ```

4. **Open in browser**
   ```
   http://localhost:5173
   ```

### Build for Production

```bash
# Build API
cd artifacts/api-server
pnpm run build

# Build UI
cd artifacts/rag-university
VITE_API_BASE=https://your-api-url pnpm run build

# Output: artifacts/rag-university/dist/public
```

## 📊 API Endpoints

### Chat
- `POST /api/chat/ask` - Submit question and get streaming response (SSE)
- `GET /api/chat/sessions` - List chat sessions
- `GET /api/chat/history/:sessionId` - Get conversation history
- `POST /api/chat/feedback` - Submit answer feedback

### Documents
- `POST /api/documents` - Upload document
- `GET /api/documents` - List all documents
- `DELETE /api/documents/:id` - Delete document
- `POST /api/documents/rebuild` - Rebuild search index

### Analytics
- `GET /api/analytics/stats` - Get platform statistics
- `GET /api/analytics/top-questions` - Get trending questions

### Health
- `GET /api/healthz` - Health check endpoint

## 🎓 Learning Resources

- **Semantic Search**: Uses embeddings for context-aware document retrieval
- **RAG Pattern**: Combines retrieval with LLM generation for accurate answers
- **Streaming Responses**: Server-Sent Events (SSE) for real-time answer delivery
- **Monorepo Architecture**: PNPM workspaces for scalable multi-package projects
- **Table Rendering**: Smart HTML table generation from markdown/pipe-delimited data

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
