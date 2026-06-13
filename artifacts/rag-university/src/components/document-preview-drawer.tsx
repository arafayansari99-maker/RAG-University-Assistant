import { useGetDocumentChunks, getGetDocumentChunksQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileText, Layers, AlertCircle, CheckCircle2, Clock,
  BookOpen, Hash, CalendarDays, HardDrive,
} from "lucide-react";

// ─── Types (mirror what the API returns) ────────────────────────────────────

interface DocumentPreviewProps {
  doc: {
    id: number;
    originalName: string;
    mimeType: string;
    fileSize: number;
    chunkCount: number;
    status: string;
    errorMessage?: string | null;
    createdAt: string;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getMimeLabel(mime: string) {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime.startsWith("text/")) return "TXT";
  return mime.split("/")[1]?.toUpperCase() ?? "FILE";
}

function StatusBadge({ status, error }: { status: string; error?: string | null }) {
  switch (status) {
    case "ready":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1">
          <CheckCircle2 className="h-3 w-3" /> Ready
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
          <Clock className="h-3 w-3 animate-spin" /> Processing
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" title={error || "Unknown error"} className="gap-1">
          <AlertCircle className="h-3 w-3" /> Error
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export function DocumentPreviewDrawer({ doc, open, onOpenChange }: DocumentPreviewProps) {
  const docId = doc?.id ?? 0;
  const { data: chunks, isLoading: chunksLoading } = useGetDocumentChunks(docId, {
    query: {
      queryKey: getGetDocumentChunksQueryKey(docId),
      enabled: open && !!doc && doc.status === "ready",
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold leading-snug break-words">
                {doc?.originalName ?? "Document"}
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs">
                Document preview and chunk breakdown
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-6">
            {doc && (
              <>
                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-3">
                  <MetaCard icon={<Hash className="h-3.5 w-3.5" />} label="Document ID" value={`#${doc.id}`} />
                  <MetaCard
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    label="Status"
                    value={<StatusBadge status={doc.status} error={doc.errorMessage} />}
                  />
                  <MetaCard
                    icon={<HardDrive className="h-3.5 w-3.5" />}
                    label="File size"
                    value={formatSize(doc.fileSize)}
                  />
                  <MetaCard
                    icon={<BookOpen className="h-3.5 w-3.5" />}
                    label="File type"
                    value={<Badge variant="secondary" className="font-mono text-[11px]">{getMimeLabel(doc.mimeType)}</Badge>}
                  />
                  <MetaCard
                    icon={<Layers className="h-3.5 w-3.5" />}
                    label="Chunks indexed"
                    value={doc.chunkCount > 0 ? doc.chunkCount.toLocaleString() : "—"}
                  />
                  <MetaCard
                    icon={<CalendarDays className="h-3.5 w-3.5" />}
                    label="Uploaded"
                    value={format(new Date(doc.createdAt), "MMM d, yyyy")}
                  />
                </div>

                {/* Error message */}
                {doc.status === "error" && doc.errorMessage && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5" /> Processing error
                    </p>
                    <p className="text-xs text-muted-foreground font-mono break-words">{doc.errorMessage}</p>
                  </div>
                )}

                {/* Chunks section */}
                {doc.status === "ready" && (
                  <>
                    <Separator />
                    <div>
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        Text chunks
                        {chunks && (
                          <Badge variant="secondary" className="ml-auto font-mono text-xs">{chunks.length}</Badge>
                        )}
                      </h3>

                      {chunksLoading ? (
                        <div className="space-y-3">
                          {[1, 2, 3].map((i) => (
                            <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                              <Skeleton className="h-3 w-24" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-4/5" />
                              <Skeleton className="h-3 w-3/5" />
                            </div>
                          ))}
                        </div>
                      ) : chunks && chunks.length > 0 ? (
                        <div className="space-y-2.5">
                          {chunks.map((chunk) => (
                            <div
                              key={chunk.id}
                              className="rounded-lg border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors p-3"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  #{chunk.chunkIndex + 1}
                                </span>
                                {chunk.pageNumber != null && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Page {chunk.pageNumber}
                                  </span>
                                )}
                                <span className="ml-auto text-[10px] text-muted-foreground">
                                  {chunk.chunkText.length} chars
                                </span>
                              </div>
                              <p className="text-xs text-foreground leading-relaxed line-clamp-5 whitespace-pre-wrap">
                                {chunk.chunkText}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          No chunks found for this document.
                        </div>
                      )}
                    </div>
                  </>
                )}

                {doc.status === "processing" && (
                  <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
                    <Clock className="h-8 w-8 animate-spin opacity-30" />
                    <p className="text-sm">Document is being processed…</p>
                    <p className="text-xs">Chunks will appear here once indexing is complete.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Small helper card ───────────────────────────────────────────────────────

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/20 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}
