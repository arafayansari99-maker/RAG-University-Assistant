import { useState, useRef, useEffect } from "react";
import { 
  useListChatSessions, 
  useCreateChatSession, 
  useDeleteChatSession, 
  useGetChatHistory,
  useSubmitFeedback,
  getGetChatHistoryQueryKey,
  getListChatSessionsQueryKey,
  useAskQuestion
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Send, PlusCircle, MessageSquare, Trash2, ThumbsUp, ThumbsDown, FileText, ChevronRight, BookOpen, Library, Download, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import CitationDrawer from "@/components/citation-drawer";

interface Citation {
  documentName: string;
  pageNumber: number | null;
  chunkText: string;
  score: number;
}

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSources, setStreamingSources] = useState<Citation[]>([]);
  const [streamingConfidence, setStreamingConfidence] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCitation, setActiveCitation] = useState<Citation | null>(null);
  const [activeCitationIndex, setActiveCitationIndex] = useState(0);
  const [lastQuestion, setLastQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Queries
  const { data: sessions, isLoading: sessionsLoading } = useListChatSessions();
  const { data: history, isLoading: historyLoading } = useGetChatHistory(activeSessionId!, {
    query: { enabled: !!activeSessionId, queryKey: getGetChatHistoryQueryKey(activeSessionId!) }
  });

  // Mutations
  const createSession = useCreateChatSession();
  const deleteSession = useDeleteChatSession();
  const submitFeedback = useSubmitFeedback();

  // Scroll to bottom when history changes or streaming updates
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, streamingContent]);

  const handleCreateSession = () => {
    createSession.mutate(undefined, {
      onSuccess: (newSession) => {
        setActiveSessionId(newSession.id);
        queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
      }
    });
  };

  const handleDeleteSession = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate({ sessionId: id }, {
      onSuccess: () => {
        if (activeSessionId === id) setActiveSessionId(null);
        queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
      }
    });
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    
    let currentSessionId = activeSessionId;
    
    // Create session if none exists
    if (!currentSessionId) {
      try {
        const session = await createSession.mutateAsync(undefined);
        currentSessionId = session.id;
        setActiveSessionId(session.id);
        queryClient.invalidateQueries({ queryKey: getListChatSessionsQueryKey() });
      } catch (err) {
        console.error("Failed to create session", err);
        return;
      }
    }

    const questionText = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingSources([]);
    setStreamingConfidence(null);
    setLastQuestion(questionText);

    // Optimistically add user message to history
    if (history) {
      const tempUserMsg = {
        id: Date.now(),
        sessionId: currentSessionId,
        role: "user" as const,
        content: questionText,
        createdAt: new Date().toISOString()
      };
      queryClient.setQueryData(getGetChatHistoryQueryKey(currentSessionId), [...history, tempUserMsg]);
    }

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/chat/ask`, {
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
    if (!history?.length) return;
    const title = activeSession?.title ?? "Chat Export";
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const lines: string[] = [
      `# ${title}`,
      `*Exported from Athena RAG — ${date}*`,
      "",
      "---",
      "",
    ];
    for (const msg of history) {
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
    if (!history?.length) return;
    const title = activeSession?.title ?? "Chat Export";
    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const msgHtml = history.map((msg) => {
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
      {/* Session History Sidebar */}
      <div className="w-72 border-r border-border bg-card flex flex-col hidden lg:flex">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">Research History</h2>
          <Button variant="ghost" size="icon" onClick={handleCreateSession} title="New Session">
            <PlusCircle className="h-5 w-5 text-primary" />
          </Button>
        </div>
        <ScrollArea className="flex-1 p-3">
          {sessionsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
            </div>
          ) : sessions?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p>No research sessions yet.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {sessions?.map(session => (
                <div 
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  className={`group flex items-center justify-between p-3 rounded-md cursor-pointer transition-colors ${
                    activeSessionId === session.id ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <MessageSquare className={`h-4 w-4 shrink-0 ${activeSessionId === session.id ? 'text-primary-foreground/80' : 'text-muted-foreground'}`} />
                    <span className="text-sm truncate font-medium">{session.title || "New Investigation"}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className={`h-6 w-6 opacity-0 group-hover:opacity-100 ${activeSessionId === session.id ? 'hover:bg-primary-foreground/20 text-primary-foreground' : 'hover:bg-destructive/10 text-destructive'}`}
                    onClick={(e) => handleDeleteSession(session.id, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {/* Session toolbar — visible when messages exist */}
        {activeSessionId && (history?.length ?? 0) > 0 && !isStreaming && (
          <div className="shrink-0 h-10 border-b border-border flex items-center justify-between px-4 md:px-8 bg-background/80 backdrop-blur-sm">
            <span className="text-xs text-muted-foreground truncate max-w-[60%]">
              {activeSession?.title}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                  <Download className="h-3.5 w-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Export conversation</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleExportMarkdown} className="gap-2 cursor-pointer">
                  <FileDown className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Markdown (.md)</p>
                    <p className="text-xs text-muted-foreground">Plain text with formatting</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPDF} className="gap-2 cursor-pointer">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">PDF</p>
                    <p className="text-xs text-muted-foreground">Print-ready document</p>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 md:p-8" ref={scrollRef}>
          {!activeSessionId && !history?.length && !isStreaming ? (
            <div className="h-full flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                <Library className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-serif text-3xl font-bold text-foreground">Athena Research Assistant</h2>
              <p className="text-lg text-muted-foreground max-w-xl">
                Ask questions about university policies, course catalogs, and academic guidelines. Responses are backed by official documentation.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-8 text-left">
                {[
                  "What are the graduation requirements for Computer Science?",
                  "How do I apply for academic leave?",
                  "What is the policy on late assignments?",
                  "Explain the library borrowing rules."
                ].map(q => (
                  <button 
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-sm transition-all text-sm text-foreground flex items-start gap-3"
                  >
                    <ChevronRight className="h-5 w-5 text-primary shrink-0" />
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-8 pb-8">
              {history?.map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'assistant' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                  }`}>
                    {msg.role === 'assistant' ? <Library className="h-4 w-4" /> : <div className="font-medium text-xs">Me</div>}
                  </div>
                  <div className={`flex-1 max-w-[85%] ${msg.role === 'assistant' ? '' : 'flex flex-col items-end'}`}>
                    <div className={`prose prose-sm md:prose-base dark:prose-invert max-w-none ${
                      msg.role === 'user' ? 'bg-secondary px-5 py-3 rounded-2xl rounded-tr-sm text-foreground inline-block' : 'text-foreground'
                    }`}>
                      {msg.content}
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
                </div>
              ))}

              {isStreaming && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                    <Library className="h-4 w-4" />
                  </div>
                  <div className="flex-1 max-w-[85%]">
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none text-foreground">
                      {streamingContent || (
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
        <div className="p-4 bg-background border-t border-border">
          <div className="max-w-4xl mx-auto relative flex items-end shadow-sm border border-border rounded-xl bg-card overflow-hidden focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all">
            <Textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about university policies, rules, or courses..."
              className="min-h-[60px] max-h-[200px] w-full resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent py-4 pl-4 pr-14 text-base"
              rows={1}
            />
            <div className="absolute right-2 bottom-2">
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
