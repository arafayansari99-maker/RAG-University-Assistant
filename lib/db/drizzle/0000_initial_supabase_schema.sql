CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"sources" jsonb,
	"confidence" real,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT 'New Chat' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_message_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "document_chunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"page_number" integer,
	"chunk_index" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"chunk_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"extracted_text" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chunks_document_id" ON "document_chunks" USING btree ("document_id");