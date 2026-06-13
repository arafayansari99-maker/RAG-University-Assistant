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
import { Send, PlusCircle, MessageSquare, Trash2, ThumbsUp, ThumbsDown, FileText, ChevronRight, BookOpen, Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function ChatPage() {
  const queryClient = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSources, setStreamingSources] = useState<any[]>([]);
  const [streamingConfidence, setStreamingConfidence] = useState<number | null>(null);
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

  return (
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
                            </h4>
                            <div className="grid gap-2">
                              {msg.sources.map((src, idx) => (
                                <div key={idx} className="text-sm bg-secondary/50 p-3 rounded-lg flex items-start gap-3">
                                  <Badge variant="outline" className="shrink-0 font-mono text-xs border-primary/20 text-primary">
                                    [{idx + 1}]
                                  </Badge>
                                  <div>
                                    <div className="font-medium text-foreground mb-1">{src.documentName} {src.pageNumber ? `(Page ${src.pageNumber})` : ''}</div>
                                    <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3 hover:line-clamp-none transition-all">{src.chunkText}</p>
                                  </div>
                                </div>
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
  );
}
