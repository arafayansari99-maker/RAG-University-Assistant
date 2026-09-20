import io
import json
import os
import re
from datetime import datetime, timezone
from typing import Any, Generator

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from groq import Groq
from pydantic import BaseModel, Field
from pypdf import PdfReader
from docx import Document

from .db import close_pool, connection, database_ready, open_pool

app = FastAPI(title="RAG University Assistant API", version="1.0.0")

origins = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=bool(origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    if database_ready():
        open_pool()


@app.on_event("shutdown")
def shutdown() -> None:
    close_pool()


class AskQuestion(BaseModel):
    question: str = Field(min_length=1)
    sessionId: int | None = None


class Feedback(BaseModel):
    feedback: str


def iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else value


def session_record(row: dict[str, Any], message_count: int = 0) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["title"],
        "createdAt": iso(row["created_at"]),
        "lastMessageAt": iso(row.get("last_message_at")),
        "messageCount": message_count,
    }


def document_record(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "filename": row["filename"],
        "originalName": row["original_name"],
        "mimeType": row["mime_type"],
        "fileSize": row["file_size"],
        "chunkCount": row["chunk_count"],
        "status": row["status"],
        "errorMessage": row.get("error_message"),
        "createdAt": iso(row["created_at"]),
    }


def message_record(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "sessionId": row["session_id"],
        "role": row["role"],
        "content": row["content"],
        "sources": row.get("sources"),
        "confidence": row.get("confidence"),
        "feedback": row.get("feedback"),
        "createdAt": iso(row["created_at"]),
    }


def extract_document(filename: str, data: bytes) -> list[tuple[int | None, str]]:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return [(index + 1, page.extract_text() or "") for index, page in enumerate(reader.pages)]
    if lower.endswith(".docx"):
        document = Document(io.BytesIO(data))
        return [(None, "\n".join(paragraph.text for paragraph in document.paragraphs))]
    if lower.endswith(".txt"):
        return [(None, data.decode("utf-8", errors="replace"))]
    raise ValueError("Only PDF, DOCX, and TXT files are supported")


def chunk_text(text: str, page: int | None) -> list[tuple[int | None, str]]:
    words = re.sub(r"\s+", " ", text.replace("\x00", " ")).strip().split(" ")
    words = [word for word in words if word]
    if not words:
        return []
    size = 800
    overlap = 150
    step = size - overlap
    return [(page, " ".join(words[start : start + size])) for start in range(0, len(words), step)]


def retrieve(question: str, limit: int = 5) -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT c.id, c.document_id, c.chunk_text, c.page_number, c.chunk_index,
                   d.original_name AS document_name,
                   ts_rank(to_tsvector('english', c.chunk_text), plainto_tsquery('english', %s)) AS rank
            FROM document_chunks c
            JOIN documents d ON d.id = c.document_id
            WHERE d.status = 'ready'
              AND (to_tsvector('english', c.chunk_text) @@ plainto_tsquery('english', %s)
                   OR c.chunk_text ILIKE %s)
            ORDER BY rank DESC, c.id ASC
            LIMIT %s
            """,
            (question, question, f"%{question}%", limit),
        ).fetchall()
    return [
        {
            "documentName": row["document_name"],
            "pageNumber": row["page_number"],
            "chunkText": row["chunk_text"],
            "score": float(row["rank"] or 0),
        }
        for row in rows
    ]


def system_prompt() -> str:
    return (
        "You are Athena RAG, a university knowledge assistant. "
        "Answer using ONLY the retrieved university document context. "
        "Never invent requirements, policies, page numbers, or sources. "
        "Use concise professional academic prose, clean bullets when useful, "
        "and finish with a Sources section. If context is insufficient, say: "
        'I couldn\'t find enough information in the university documents to answer confidently.'
    )


def user_prompt(question: str, chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return f"Question: {question}\n\nContext: No relevant documents found."
    context = "\n\n---\n\n".join(
        f"[Source {index}: {item['documentName']}, Page {item['pageNumber']}]\n{item['chunkText']}"
        for index, item in enumerate(chunks, 1)
    )
    return f"Question: {question}\n\nContext from university documents:\n{context}\n\nAnswer using only this context and list the sources used."


def fallback(chunks: list[dict[str, Any]]) -> str:
    if not chunks:
        return "I couldn't find enough information in the university documents to answer confidently."
    sources = "\n".join(
        f"{index}. {item['documentName']}" + (f" (Page {item['pageNumber']})" if item["pageNumber"] else "")
        for index, item in enumerate(chunks[:3], 1)
    )
    return f"I found relevant context in the uploaded university documents, but the language model is unavailable.\n\nSources:\n{sources}"


def confidence(chunks: list[dict[str, Any]], answer: str) -> float:
    if not chunks or "couldn't find enough" in answer.lower():
        return 0.2 if not chunks else 0.1
    return round(min(0.98, 0.45 + min(len(chunks) / 5, 1) * 0.2 + 0.2), 2)


def sse(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, default=iso)}\n\n"


@app.get("/api/healthz")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/chat/sessions")
def list_sessions() -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT s.*, COUNT(m.id)::int AS message_count
            FROM chat_sessions s LEFT JOIN chat_messages m ON m.session_id = s.id
            GROUP BY s.id ORDER BY s.last_message_at DESC NULLS LAST, s.created_at DESC
            """
        ).fetchall()
    return [session_record(row, row["message_count"]) for row in rows]


@app.post("/api/chat/sessions", status_code=201)
def create_session() -> dict[str, Any]:
    with connection() as conn:
        row = conn.execute(
            "INSERT INTO chat_sessions (title) VALUES ('New Chat') RETURNING *"
        ).fetchone()
    return session_record(row)


@app.delete("/api/chat/sessions/{session_id}", status_code=204)
def delete_session(session_id: int) -> None:
    with connection() as conn:
        result = conn.execute("DELETE FROM chat_sessions WHERE id = %s", (session_id,))
    if result.rowcount == 0:
        raise HTTPException(404, "Session not found")


@app.get("/api/chat/sessions/{session_id}/messages")
def list_messages(session_id: int) -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT * FROM chat_messages WHERE session_id = %s ORDER BY created_at",
            (session_id,),
        ).fetchall()
    return [message_record(row) for row in rows]


@app.post("/api/chat/ask")
def ask(request: AskQuestion) -> StreamingResponse:
    question = request.question.strip()
    with connection() as conn:
        session_id = request.sessionId
        if session_id is None:
            row = conn.execute(
                "INSERT INTO chat_sessions (title) VALUES (%s) RETURNING id",
                (question[:60],),
            ).fetchone()
            session_id = row["id"]
        conn.execute(
            "INSERT INTO chat_messages (session_id, role, content) VALUES (%s, 'user', %s)",
            (session_id, question),
        )
        history = conn.execute(
            "SELECT role, content FROM chat_messages WHERE session_id = %s ORDER BY created_at DESC LIMIT 8",
            (session_id,),
        ).fetchall()

    chunks = retrieve(question)
    citations = [
        {**item, "chunkText": item["chunkText"][:300], "score": round(item["score"], 2)}
        for item in chunks
    ]
    history.reverse()

    def stream() -> Generator[str, None, None]:
        yield sse({"sessionId": session_id}) if request.sessionId is None else ""
        answer = ""
        try:
            api_key = os.getenv("GROQ_API_KEY")
            if api_key:
                client = Groq(api_key=api_key)
                messages = [{"role": "system", "content": system_prompt()}]
                messages.extend({"role": row["role"], "content": row["content"]} for row in history[-6:])
                messages.append({"role": "user", "content": user_prompt(question, chunks)})
                response = client.chat.completions.create(
                    model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"),
                    messages=messages,
                    max_tokens=1024,
                    stream=True,
                )
                for part in response:
                    content = part.choices[0].delta.content if part.choices else ""
                    if content:
                        answer += content
                        yield sse({"content": content})
            else:
                answer = fallback(chunks)
                yield sse({"content": answer})

            answer = answer.strip() or fallback(chunks)
            score = confidence(chunks, answer)
            with connection() as conn:
                saved = conn.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, sources, confidence)
                    VALUES (%s, 'assistant', %s, %s::jsonb, %s) RETURNING id
                    """,
                    (session_id, answer, json.dumps(citations), score),
                ).fetchone()
                conn.execute(
                    "UPDATE chat_sessions SET last_message_at = NOW() WHERE id = %s",
                    (session_id,),
                )
            yield sse({
                "done": True,
                "messageId": saved["id"],
                "sources": citations,
                "confidence": score,
                "sessionId": session_id,
            })
        except Exception as error:
            yield sse({"error": str(error), "done": True, "sessionId": session_id})

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})


@app.post("/api/chat/messages/{message_id}/feedback")
def feedback(message_id: int, request: Feedback) -> dict[str, Any]:
    if request.feedback not in {"helpful", "not_helpful"}:
        raise HTTPException(400, "feedback must be helpful or not_helpful")
    with connection() as conn:
        row = conn.execute(
            "UPDATE chat_messages SET feedback = %s WHERE id = %s RETURNING *",
            (request.feedback, message_id),
        ).fetchone()
    if row is None:
        raise HTTPException(404, "Message not found")
    return message_record(row)


@app.get("/api/documents")
def list_documents() -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute("SELECT * FROM documents ORDER BY created_at DESC").fetchall()
    return [document_record(row) for row in rows]


@app.post("/api/documents", status_code=201)
def upload_document(file: UploadFile = File(...)) -> dict[str, Any]:
    data = file.file.read()
    filename = file.filename or "upload.txt"
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "File size must be 20 MB or less")
    try:
        pages = extract_document(filename, data)
        chunks = [item for page, text in pages for item in chunk_text(text, page)]
        extracted = "\n\n".join(text for _, text in pages)
        with connection() as conn:
            row = conn.execute(
                """
                INSERT INTO documents (filename, original_name, mime_type, file_size, chunk_count, status, extracted_text)
                VALUES (%s, %s, %s, %s, %s, 'ready', %s) RETURNING *
                """,
                (filename, filename, file.content_type or "application/octet-stream", len(data), len(chunks), extracted),
            ).fetchone()
            for index, (page, text) in enumerate(chunks):
                conn.execute(
                    "INSERT INTO document_chunks (document_id, chunk_text, page_number, chunk_index) VALUES (%s, %s, %s, %s)",
                    (row["id"], text, page, index),
                )
            row["chunk_count"] = len(chunks)
        return document_record(row)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(400, f"Document processing failed: {error}") from error


@app.get("/api/documents/{document_id}")
def get_document(document_id: int) -> dict[str, Any]:
    with connection() as conn:
        row = conn.execute("SELECT * FROM documents WHERE id = %s", (document_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "Document not found")
    return document_record(row)


@app.get("/api/documents/{document_id}/chunks")
def get_chunks(document_id: int) -> list[dict[str, Any]]:
    with connection() as conn:
        exists = conn.execute("SELECT id FROM documents WHERE id = %s", (document_id,)).fetchone()
        if exists is None:
            raise HTTPException(404, "Document not found")
        rows = conn.execute(
            "SELECT * FROM document_chunks WHERE document_id = %s ORDER BY chunk_index",
            (document_id,),
        ).fetchall()
    return [
        {"id": row["id"], "documentId": row["document_id"], "chunkText": row["chunk_text"], "pageNumber": row["page_number"], "chunkIndex": row["chunk_index"], "createdAt": iso(row["created_at"])}
        for row in rows
    ]


@app.delete("/api/documents/{document_id}", status_code=204)
def delete_document(document_id: int) -> None:
    with connection() as conn:
        result = conn.execute("DELETE FROM documents WHERE id = %s", (document_id,))
    if result.rowcount == 0:
        raise HTTPException(404, "Document not found")


@app.post("/api/documents/rebuild-index")
def rebuild_index() -> dict[str, Any]:
    with connection() as conn:
        rows = conn.execute("SELECT id, extracted_text FROM documents WHERE extracted_text IS NOT NULL").fetchall()
        total = 0
        for row in rows:
            conn.execute("DELETE FROM document_chunks WHERE document_id = %s", (row["id"],))
            chunks = chunk_text(row["extracted_text"], None)
            for index, (_, text) in enumerate(chunks):
                conn.execute(
                    "INSERT INTO document_chunks (document_id, chunk_text, chunk_index) VALUES (%s, %s, %s)",
                    (row["id"], text, index),
                )
            conn.execute("UPDATE documents SET chunk_count = %s WHERE id = %s", (len(chunks), row["id"]))
            total += len(chunks)
    return {"success": True, "chunksIndexed": total}


@app.get("/api/analytics/stats")
def analytics_stats() -> dict[str, Any]:
    with connection() as conn:
        row = conn.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM documents)::int AS total_documents,
              (SELECT COUNT(*) FROM document_chunks)::int AS total_chunks,
              (SELECT COUNT(*) FROM chat_messages WHERE role = 'user')::int AS total_questions,
              (SELECT COUNT(*) FROM chat_sessions)::int AS total_sessions,
              COALESCE((SELECT AVG(CASE WHEN feedback = 'helpful' THEN 1.0 ELSE 0.0 END) FROM chat_messages WHERE feedback IS NOT NULL), 0) AS helpful_rate,
              COALESCE((SELECT AVG(confidence) FROM chat_messages WHERE role = 'assistant'), 0) AS avg_confidence,
              (SELECT COUNT(*) FROM chat_messages WHERE role = 'user' AND created_at >= CURRENT_DATE)::int AS questions_today
            """
        ).fetchone()
    return {
        "totalDocuments": row["total_documents"],
        "totalChunks": row["total_chunks"],
        "totalQuestions": row["total_questions"],
        "totalSessions": row["total_sessions"],
        "helpfulRate": float(row["helpful_rate"]),
        "avgConfidence": float(row["avg_confidence"]),
        "questionsToday": row["questions_today"],
    }


@app.get("/api/analytics/top-questions")
def top_questions() -> list[dict[str, Any]]:
    with connection() as conn:
        rows = conn.execute(
            "SELECT content AS question, COUNT(*)::int AS count FROM chat_messages WHERE role = 'user' GROUP BY content ORDER BY count DESC LIMIT 10"
        ).fetchall()
    return [{"question": row["question"], "count": row["count"]} for row in rows]
