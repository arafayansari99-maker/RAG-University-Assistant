import { useState, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  useGetChatHistory,
  useSubmitFeedback,
  getGetChatHistoryQueryKey,
  getListChatSessionsQueryKey,
  useAskQuestion
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, Trash2, ThumbsUp, ThumbsDown, FileText, ChevronRight, Library, Download, FileDown, MoreVertical, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CitationDrawer from "@/components/citation-drawer";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useChatHistoryNavigation } from "@/components/layout";

interface Citation {
  documentName: string;
  pageNumber: number | null;
  chunkText: string;
  score: number;
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    [index: number]: { [index: number]: { transcript: string } };
    length: number;
  };
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onend: (() => void) | null;
  onerror: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const { sessions, activeSessionId, setActiveSessionId, createSession, deleteSession } = useChatHistoryNavigation();
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingError, setStreamingError] = useState<string | null>(null);
  const [streamingSources, setStreamingSources] = useState<Citation[]>([]);
  const [streamingConfidence, setStreamingConfidence] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [activeCitationIndex, setActiveCitationIndex] = useState(0);
  const [lastQuestion, setLastQuestion] = useState("");
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognition));
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index][0].transcript).join(" ").trim();
      if (transcript) setInput((current) => `${current}${current.trim() ? " " : ""}${transcript}`);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast({ title: "Voice input unavailable", description: "Check microphone permission and try again.", variant: "destructive" });
    };
    speechRecognitionRef.current = recognition;

    return () => {
      recognition.stop();
      speechRecognitionRef.current = null;
    };
  }, []);

  const toggleSpeechInput = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) {
      toast({ title: "Voice input is not supported", description: "Try Chrome or Edge for speech-to-text support." });
      return;
    }
    if (isListening) {
      recognition.stop();
      setIsListening(false);
      return;
    }
    try {
      recognition.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
      toast({ title: "Could not start voice input", description: "Check microphone permission and try again.", variant: "destructive" });
    }
  };

  // Queries
  const { data: history, isLoading: historyLoading } = useGetChatHistory(activeSessionId!, {
    query: { enabled: !!activeSessionId, queryKey: getGetChatHistoryQueryKey(activeSessionId!) }
  });

  const displayHistory = useMemo(() => {
    return history ?? [];
  }, [history]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("athena-suggested-questions") ?? "[]");
      if (Array.isArray(saved)) setSuggestedQuestions(saved.filter((item): item is string => typeof item === "string").slice(0, 4));
    } catch {
      setSuggestedQuestions([]);
    }
  }, []);

  // Mutations
  const submitFeedback = useSubmitFeedback();

  // Keep live output visible, then let the completed response settle before
  // smoothly moving the viewport to its end.
  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    if (isStreaming) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    }, 220);

    return () => window.clearTimeout(timeoutId);
  }, [displayHistory, isStreaming, streamingContent]);

  const handleDeleteActiveChat = () => {
    if (!activeSessionId) return;
    void deleteSession(activeSessionId);
  };

  const renderMessageBody = (role: "user" | "assistant", content: string) => {
    const clean = String(content || "").trim();

    if (role === "assistant") {
      return (
        <div className="prose prose-sm max-w-none text-sm leading-7 text-foreground dark:prose-invert prose-headings:font-black prose-headings:tracking-tight prose-headings:text-primary prose-p:my-2 prose-ul:my-3 prose-ul:pl-6 prose-ol:my-3 prose-ol:pl-6 prose-li:my-1 prose-table:my-4 prose-th:border prose-th:border-border prose-th:bg-muted prose-th:px-3 prose-th:py-2 prose-th:text-center prose-th:text-foreground prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2 prose-td:text-center prose-td:text-foreground prose-strong:text-foreground prose-em:text-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{clean}</ReactMarkdown>
        </div>
      );
    }

    return <span className="whitespace-pre-wrap leading-7">{clean}</span>;
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    
    let currentSessionId = activeSessionId;
    
    // Create session if none exists
    if (!currentSessionId) {
      try {
        const session = await createSession();
        currentSessionId = session.id;
        setActiveSessionId(session.id);
      } catch (err) {
        console.error("Failed to create session", err);
        return;
      }
    }

    const questionText = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingError(null);
    setStreamingSources([]);
    setStreamingConfidence(null);
    setLastQuestion(questionText);

    // Optimistically put the user message into the same query cache object that
    // the chat history hook reads, so there is only one source of truth.
    const tempUserMsg = {
      id: Date.now(),
      sessionId: currentSessionId,
      role: "user" as const,
      content: questionText,
      sources: null,
      confidence: null,
      feedback: null,
      createdAt: new Date().toISOString(),
    };

    const sessionHistoryKey = getGetChatHistoryQueryKey(currentSessionId);
    const sessionHistory = queryClient.getQueryData<any[]>(sessionHistoryKey) ?? [];
    queryClient.setQueryData(sessionHistoryKey, [...sessionHistory, tempUserMsg]);

    try {
      const apiBase = ((import.meta.env.VITE_API_BASE as string) || (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:3001").replace(/\/+$/, "");
      const res = await fetch(`${apiBase}/api/chat/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, sessionId: currentSessionId })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') continue;
            try {
              const data = JSON.parse(dataStr);
              if (data.content) setStreamingContent(prev => prev + data.content);
              if (data.error) setStreamingError(data.error);
              if (data.sources) setStreamingSources(data.sources);
              if (data.confidence !== undefined) setStreamingConfidence(data.confidence);
              if (data.done) {
                // Done streaming
              }
            } catch (e) {
              console.error("Parse error", e, line);
            }
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
    } finally {
      setIsStreaming(false);
      if (currentSessionId) {
        queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(currentSessionId) });
        queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFeedback = (messageId: number, feedback: 'helpful' | 'not_helpful') => {
    submitFeedback.mutate({ messageId, data: { feedback } }, {
      onSuccess: () => {
        if (activeSessionId) {
          queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey(activeSessionId) });
        }
      }
    });
  };

  const activeSession = sessions?.find((s) => s.id === activeSessionId);

  const handleExportMarkdown = () => {
    if (!displayHistory.length) return;
    const title = activeSession?.title ?? "Chat Export";
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const lines: string[] = [
      `# ${title}`,
      `*Exported from Athena RAG — ${date}*`,
      "",
      "---",
      "",
    ];
    for (const msg of displayHistory) {
      if (msg.role === "user") {
        lines.push(`**You:** ${msg.content}`, "");
      } else {
        lines.push(`**Athena:**`, "", msg.content, "");
        const srcs = msg.sources as Citation[] | null;
        if (srcs && srcs.length > 0) {
          lines.push("*Sources:*");
          srcs.forEach((s, i) => {
            lines.push(`> [${i + 1}] **${s.documentName}**${s.pageNumber ? ` — Page ${s.pageNumber}` : ""}`);
            lines.push(`> ${s.chunkText.slice(0, 200)}${s.chunkText.length > 200 ? "…" : ""}`);
          });
          lines.push("");
        }
        if (msg.confidence != null) {
          lines.push(`*Confidence: ${(msg.confidence * 100).toFixed(0)}%*`, "");
        }
        lines.push("---", "");
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    if (!displayHistory.length) return;
    const title = activeSession?.title ?? "Chat Export";
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const msgHtml = displayHistory.map((msg) => {
      if (msg.role === "user") {
        return `<div class="msg user"><div class="bubble">${msg.content.replace(/</g, "&lt;")}</div></div>`;
      }
      const srcs = msg.sources as Citation[] | null;
      const sourcesHtml = srcs && srcs.length > 0
        ? `<div class="sources"><div class="sources-label">Sources & Citations</div>${srcs.map((s, i) =>
            `<div class="source"><span class="src-idx">[${i + 1}]</span><div><strong>${s.documentName.replace(/</g, "&lt;")}${s.pageNumber ? ` — Page ${s.pageNumber}` : ""}</strong><p>${s.chunkText.slice(0, 300).replace(/</g, "&lt;")}${s.chunkText.length > 300 ? "…" : ""}</p></div></div>`
          ).join("")}</div>`
        : "";
      const confHtml = msg.confidence != null
        ? `<div class="confidence">Confidence: ${(msg.confidence * 100).toFixed(0)}%</div>`
        : "";
      return `<div class="msg assistant"><div class="content">${msg.content.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</div>${sourcesHtml}${confHtml}</div>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; font-size: 13px; line-height: 1.6; color: #1e2a3a; background: #fff; padding: 48px; max-width: 780px; margin: 0 auto; }
  h1 { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .meta { color: #64748b; font-size: 11px; margin-bottom: 32px; padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; }
  .msg { margin-bottom: 24px; }
  .msg.user { display: flex; justify-content: flex-end; }
  .msg.user .bubble { background: #f1f5f9; border-radius: 12px 12px 2px 12px; padding: 10px 14px; max-width: 70%; font-size: 13px; }
  .msg.assistant .content { font-size: 13px; white-space: pre-wrap; margin-bottom: 10px; }
  .sources { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-top: 8px; }
  .sources-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #64748b; margin-bottom: 8px; }
  .source { display: flex; gap: 8px; margin-bottom: 8px; font-size: 11px; }
  .source:last-child { margin-bottom: 0; }
  .src-idx { font-family: monospace; font-weight: 700; color: #1e3a5f; white-space: nowrap; }
  .source strong { display: block; color: #1e2a3a; margin-bottom: 2px; }
  .source p { color: #64748b; }
  .confidence { font-size: 10px; color: #64748b; margin-top: 6px; }
  @media print { body { padding: 24px; } }
</style></head><body>
<h1>${title.replace(/</g, "&lt;")}</h1>
<div class="meta">Exported from Athena RAG &mdash; ${date}</div>
${msgHtml}
</body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 600);
  };

  return (
    <>
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {/* Session toolbar — visible when messages exist */}
        {activeSessionId && displayHistory.length > 0 && !isStreaming && (
          <div className="shrink-0 h-10 border-b border-border flex items-center px-4 md:px-8 bg-background/80 backdrop-blur-sm">
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">
              {activeSession?.title}
            </span>
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground" aria-label="Chat options">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs">Chat Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleExportMarkdown} className="gap-2 cursor-pointer">
                    <FileDown className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Export Markdown</p>
                      <p className="text-xs text-muted-foreground">Plain text with formatting</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Export PDF</p>
                      <p className="text-xs text-muted-foreground">Print-ready document</p>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleDeleteActiveChat} className="gap-2 cursor-pointer text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    <span className="text-sm font-medium">Delete Chat</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 md:p-8" ref={scrollRef}>
          {!displayHistory.length && !isStreaming ? (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center space-y-6 text-center">
              <motion.div animate={{ rotateY: [0, 8, 0], rotateZ: [0, -2, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} className="depth-card flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/20 bg-primary/10 shadow-float [transform-style:preserve-3d]">
                <Library className="h-8 w-8 text-primary" />
              </motion.div>
              <p className="page-kicker">University knowledge engine</p>
              <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground md:text-5xl">Athena Research Assistant</h2>
              <p className="text-lg text-muted-foreground max-w-xl">
                Ask questions about university policies, course catalogs, and academic guidelines. Responses are backed by official documentation.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-8 text-left">
                {(suggestedQuestions.length > 0 ? suggestedQuestions : [
                  "What are the graduation requirements for Computer Science?",
                  "How do I apply for academic leave?",
                  "What is the policy on late assignments?",
                  "Explain the library borrowing rules."
                ]).map(q => (
                  <button 
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="depth-card flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 p-4 text-sm text-foreground shadow-card backdrop-blur-sm"
                  >
                    <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8 pb-8">
              {displayHistory.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: -18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.42, ease: "easeOut" }}
                  className={`flex gap-4 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'assistant' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {msg.role === 'assistant' ? <Library className="h-4 w-4" /> : <div className="font-medium text-xs">Me</div>}
                  </div>
                  <div className={`flex-1 max-w-[85%] ${msg.role === 'assistant' ? '' : 'flex flex-col items-end'}`}>
                    <div className={`prose prose-sm rounded-2xl md:prose-base dark:prose-invert max-w-none ${
                      msg.role === 'user' ? 'bg-secondary px-5 py-3 rounded-2xl rounded-tr-sm text-foreground inline-block' : 'text-foreground'
                    }`}>
                      {renderMessageBody(msg.role, msg.content)}
                    </div>
                    
                    {msg.role === 'assistant' && (
                      <div className="mt-4 flex flex-col gap-4">
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                              <FileText className="h-3 w-3" />
                              Sources & Citations
                              <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground/70">Click to preview</span>
                            </h4>
                            <div className="grid gap-2">
                              {(msg.sources as Citation[]).map((src, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    setActiveCitation(src);
                                    setActiveCitationIndex(idx);
                                    setDrawerOpen(true);
                                  }}
                                  className="text-sm bg-secondary/50 hover:bg-secondary p-3 rounded-lg flex items-start gap-3 text-left w-full transition-colors group cursor-pointer border border-transparent hover:border-primary/20"
                                >
                                  <Badge variant="outline" className="shrink-0 font-mono text-xs border-primary/20 text-primary mt-0.5">
                                    [{idx + 1}]
                                  </Badge>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                                      {src.documentName}
                                      {src.pageNumber ? <span className="text-muted-foreground font-normal">(Page {src.pageNumber})</span> : null}
                                      <ChevronRight className="h-3 w-3 text-primary ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                    </div>
                                    <p className="text-muted-foreground text-xs leading-relaxed line-clamp-2">{src.chunkText}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {msg.confidence !== null && msg.confidence !== undefined && (
                            <span className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                              {(msg.confidence * 100).toFixed(0)}% Confidence
                            </span>
                          )}
                          <div className="flex items-center gap-1 border-l border-border pl-4">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={`h-7 px-2 ${msg.feedback === 'helpful' ? 'text-primary bg-primary/10' : ''}`}
                              onClick={() => handleFeedback(msg.id, 'helpful')}
                            >
                              <ThumbsUp className="h-3 w-3 mr-1.5" /> Helpful
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className={`h-7 px-2 ${msg.feedback === 'not_helpful' ? 'text-destructive bg-destructive/10' : ''}`}
                              onClick={() => handleFeedback(msg.id, 'not_helpful')}
                            >
                              <ThumbsDown className="h-3 w-3 mr-1.5" /> Unhelpful
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}

              {isStreaming && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Library className="h-4 w-4" />
                  </div>
                  <div className="flex-1 max-w-[85%]">
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-foreground">
                      {streamingError ? (
                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                          {streamingError}
                        </div>
                      ) : streamingContent ? renderMessageBody("assistant", streamingContent) : (
                        <span className="flex gap-1 py-2">
                          <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce"></span>
                          <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                          <span className="w-1.5 h-1.5 bg-primary/50 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                        </span>
                      )}
                    </div>
                    
                    {streamingSources.length > 0 && (
                      <div className="mt-4 bg-card border border-border rounded-xl p-4 shadow-sm opacity-70">
                         <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                            <FileText className="h-3 w-3" />
                            Retrieving Sources...
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {streamingSources.map((src, idx) => (
                              <Badge key={idx} variant="secondary" className="font-mono text-xs">
                                {src.documentName}
                              </Badge>
                            ))}
                          </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-border/80 bg-background/75 p-3 backdrop-blur-md sm:p-4">
          <div className="depth-card mx-auto relative flex max-w-4xl items-end overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-card focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
            <Textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about university policies, rules, or courses..."
              className="min-h-[60px] max-h-[200px] w-full resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent py-4 pl-4 pr-24 text-base"
              rows={1}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleSpeechInput}
                disabled={isStreaming}
                title={isListening ? "Stop voice input" : speechSupported ? "Use voice input" : "Voice input unavailable"}
                aria-label={isListening ? "Stop voice input" : "Use voice input"}
                className={cn("h-10 w-10 rounded-lg", isListening ? "bg-destructive/10 text-destructive hover:bg-destructive/20" : "text-muted-foreground hover:text-foreground")}
              >
                {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button 
                size="icon" 
                onClick={handleSend} 
                disabled={!input.trim() || isStreaming}
                className="h-10 w-10 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="text-center mt-2">
            <span className="text-xs text-muted-foreground">Athena RAG uses officially indexed university documentation to provide accurate answers.</span>
          </div>
        </div>
      </div>
    </div>
    <CitationDrawer
      open={drawerOpen}
      onClose={() => setDrawerOpen(false)}
      citation={activeCitation}
      citationIndex={activeCitationIndex}
      question={lastQuestion}
    />
    </>
  );
}
