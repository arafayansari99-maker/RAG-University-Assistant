# FastAPI + Supabase + Vercel Deployment

This deployment uses two Vercel projects and one Supabase PostgreSQL project:

```text
Vercel project 1: React frontend
Vercel project 2: FastAPI backend
Supabase:        PostgreSQL database
```

The FastAPI backend preserves the existing frontend API paths and SSE chat response contract.

Vercel serverless functions have a 4.5 MB request-body limit. The frontend therefore limits uploads to 4 MB when `VITE_API_BASE` points to a Vercel API. Larger institutional PDFs must use the Express API on Fly/Replit, direct object storage uploads, or another persistent API host.

## 1. Prepare Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **Project Settings > Database**.
3. Copy the direct PostgreSQL connection string.
4. From the repository root, push the existing Drizzle schema:

```powershell
$env:DATABASE_URL = "postgresql://postgres.<project-ref>:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
pnpm db:push
Remove-Item Env:DATABASE_URL
```

Use the direct URL for schema setup. For the deployed API, use a Supabase pooled connection string when available.

## 2. Deploy the FastAPI backend to Vercel

Create a new Vercel project from the same GitHub repository.

Set the project **Root Directory** to:

```text
artifacts/api-fastapi
```

Vercel will detect `api/index.py` and install dependencies from `requirements.txt`.

Add these environment variables to the FastAPI Vercel project:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase pooled PostgreSQL URL |
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | `openai/gpt-oss-20b` |
| `DB_POOL_MAX` | `5` |
| `CORS_ORIGINS` | Your frontend Vercel URL |
| `CORS_ORIGIN_REGEX` | `https://[a-zA-Z0-9-]+\.vercel\.app` for Vercel preview deployments |
|

Set `GROQ_API_KEY` for the **Production** environment and redeploy after saving it. If it is missing, `/api/healthz` returns `groqConfigured: "false"` and chat displays a configuration error instead of silently returning a non-LLM fallback answer.

After deployment, test:

```text
https://your-api-project.vercel.app/api/healthz
```

Expected response:

```json
{"status":"ok"}
```

## 3. Deploy the React frontend to Vercel

Create a second Vercel project from the same GitHub repository.

Keep the project root at the repository root. The root `vercel.json` builds the frontend package.

Add this environment variable:

```text
VITE_API_BASE=https://your-api-project.vercel.app
```

The frontend project uses:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/rag-university run build`
- Output directory: `artifacts/rag-university/dist/public`

## 4. Test the complete application

1. Open the frontend Vercel URL.
2. Upload a PDF, DOCX, or TXT file.
3. Confirm the document status becomes `ready`.
4. Ask a question about the document.
5. Confirm streamed SSE content appears.
6. Confirm citations and confidence appear with the final answer.
7. Refresh the page and confirm chat history is stored in Supabase.

If the API project root shows `Not Found`, test `/` or `/api/healthz`. The API project must use `artifacts/api-fastapi` as its Vercel Root Directory. The frontend's `VITE_API_BASE` must be the API origin, such as `https://your-api-project.vercel.app`, without a trailing `/api` path.

## API compatibility

The FastAPI service implements:

- `GET /api/healthz`
- `GET|POST /api/chat/sessions`
- `DELETE /api/chat/sessions/{session_id}`
- `GET /api/chat/sessions/{session_id}/messages`
- `POST /api/chat/ask`
- `POST /api/chat/messages/{message_id}/feedback`
- `GET|POST /api/documents`
- `GET /api/documents/{document_id}`
- `GET /api/documents/{document_id}/chunks`
- `DELETE /api/documents/{document_id}`
- `POST /api/documents/rebuild-index`
- `GET /api/analytics/stats`
- `GET /api/analytics/top-questions`

## Local FastAPI development

From the repository root:

```powershell
cd artifacts/api-fastapi
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "your_supabase_connection_string"
$env:GROQ_API_KEY = "your_groq_key"
$env:CORS_ORIGINS = "http://localhost:5173"
uvicorn app.main:app --reload --port 8000
```

Run the frontend separately with `VITE_API_BASE=http://localhost:8000`.

## Vercel limitations

Vercel runs FastAPI as a serverless Python function. This is suitable for low-volume use, but it has execution time, memory, request-size, and streaming limits. Supabase-backed document text is persisted in PostgreSQL; do not depend on local filesystem storage between invocations.

If the project later needs long-running OCR jobs or guaranteed uninterrupted streaming, a persistent Python host can be added without changing the Supabase schema or frontend API contract.
