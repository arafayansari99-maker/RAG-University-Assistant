import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const groqPath = resolve(root, "artifacts/api-server/src/lib/groq.ts");
const chatPath = resolve(root, "artifacts/api-server/src/routes/chat.ts");

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, condition, detail });
}

function requireText(source, name, text) {
  check(name, source.includes(text), `Expected source to contain: ${text}`);
}

async function runContractChecks() {
  const [groqSource, chatSource] = await Promise.all([
    readFile(groqPath, "utf8"),
    readFile(chatPath, "utf8"),
  ]);

  requireText(groqSource, "Configured Groq model", 'GROQ_MODEL = "openai/gpt-oss-20b"');
  requireText(groqSource, "Explicit token limit", "GROQ_MAX_TOKENS = 1024");
  requireText(groqSource, "Streaming enabled", "stream: true");
  requireText(groqSource, "Source-only instruction", "Answer using ONLY the retrieved university document context");
  requireText(groqSource, "No-invention instruction", "Never invent requirements, policies, programme details");
  requireText(groqSource, "Insufficient-context instruction", "I couldn't find enough information in the university documents to answer confidently.");
  requireText(groqSource, "Sources instruction", "At the end of your answer, list the sources you used.");
  requireText(groqSource, "Prompt fingerprint logging", '"Prepared Groq request"');
  requireText(groqSource, "Prompt role logging", "messageRoles: messages.map((message) => message.role)");
  requireText(chatSource, "Chat request validation", "AskQuestionBody.safeParse(req.body)");
  requireText(chatSource, "Retrieved context limit", "retrieveChunks(question, 5)");
  requireText(chatSource, "SSE response contract", "done: true");
}

async function runLiveChecks(baseUrl) {
  const healthResponse = await fetch(`${baseUrl}/api/healthz`);
  check("Live health endpoint", healthResponse.ok, `${healthResponse.status} ${healthResponse.statusText}`);

  const chatResponse = await fetch(`${baseUrl}/api/chat/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "What university information is available?" }),
  });

  const body = await chatResponse.text();
  check("Live chat endpoint", chatResponse.ok, `${chatResponse.status} ${chatResponse.statusText}`);
  check("Live SSE content", body.includes("data:"), "Expected at least one SSE data event");
  check("Live completion event", body.includes('"done":true'), "Expected a final done event");
  check("Live confidence field", body.includes('"confidence"'), "Expected confidence in the final event");
}

try {
  await runContractChecks();

  const liveIndex = process.argv.indexOf("--live");
  if (liveIndex !== -1) {
    const baseUrl = process.argv[liveIndex + 1] ?? "http://localhost:3001";
    await runLiveChecks(baseUrl.replace(/\/$/, ""));
  }
} catch (error) {
  console.error(`Evaluation could not complete: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
}

const failures = checks.filter((result) => !result.condition);
for (const result of checks) {
  console.log(`${result.condition ? "PASS" : "FAIL"} ${result.name}${result.condition ? "" : ` - ${result.detail}`}`);
}

console.log(`\n${checks.length - failures.length}/${checks.length} checks passed.`);
if (failures.length > 0) process.exitCode = 1;
