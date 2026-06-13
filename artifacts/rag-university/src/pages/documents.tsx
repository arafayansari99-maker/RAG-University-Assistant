import { useState, useRef, useMemo } from "react";
import { useListDocuments, useDeleteDocument, useRebuildIndex, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Upload, Trash2, RefreshCw, File, AlertCircle, CheckCircle2, Clock, Search, X, FileText, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type StatusFilter = "all" | "ready" | "processing" | "error";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Error" },
];

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: documents, isLoading } = useListDocuments();
  const deleteDoc = useDeleteDocument();
  const rebuildIndex = useRebuildIndex();

  const filtered = useMemo(() => {
    if (!documents) return [];
    return documents.filter((doc) => {
      const matchesSearch = doc.originalName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || doc.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [documents, search, statusFilter]);

  const counts = useMemo(() => {
    if (!documents) return { all: 0, ready: 0, processing: 0, error: 0 };
    return {
      all: documents.length,
      ready: documents.filter((d) => d.status === "ready").length,
      processing: documents.filter((d) => d.status === "processing").length,
      error: documents.filter((d) => d.status === "error").length,
    };
  }, [documents]);

  const totalChunks = useMemo(
    () => (documents ?? []).reduce((sum, d) => sum + (d.chunkCount ?? 0), 0),
    [documents]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/documents`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      toast({ title: "Document uploaded", description: "The document is being processed and will be ready shortly." });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    } catch {
      toast({ title: "Upload failed", description: "Failed to upload the document.", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = (id: number) => {
    deleteDoc.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Document deleted" });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      },
    });
  };

  const handleRebuild = () => {
    rebuildIndex.mutate(undefined, {
      onSuccess: (res) => {
        toast({ title: "Index rebuilt", description: `${res.chunksIndexed} chunks indexed.` });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      },
      onError: () => toast({ title: "Rebuild failed", variant: "destructive" }),
    });
  };

  const getStatusBadge = (status: string, error?: string | null) => {
    switch (status) {
      case "ready":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 whitespace-nowrap"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>;
      case "processing":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1 whitespace-nowrap"><Clock className="h-3 w-3 animate-spin" /> Processing</Badge>;
      case "error":
        return <Badge variant="destructive" title={error || "Unknown error"} className="gap-1 whitespace-nowrap"><AlertCircle className="h-3 w-3" /> Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const getMimeLabel = (mime: string) => {
    if (mime === "application/pdf") return "PDF";
    if (mime.includes("wordprocessingml")) return "DOCX";
    if (mime.startsWith("text/")) return "TXT";
    return mime.split("/")[1]?.toUpperCase() ?? "FILE";
  };

  const hasDocuments = (documents?.length ?? 0) > 0;
  const hasResults = filtered.length > 0;
  const isFiltering = search !== "" || statusFilter !== "all";

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Library & Index</h1>
          <p className="text-muted-foreground mt-1">Manage knowledge base documents and search index.</p>

          {/* Summary stats */}
          {!isLoading && hasDocuments && (
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{counts.all}</span> document{counts.all !== 1 ? "s" : ""}
              </span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Layers className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{totalChunks.toLocaleString()}</span> chunks indexed
              </span>
              {counts.processing > 0 && (
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                  {counts.processing} processing
                </Badge>
              )}
              {counts.error > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                  {counts.error} error{counts.error !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={handleRebuild}
            disabled={rebuildIndex.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${rebuildIndex.isPending ? "animate-spin" : ""}`} />
            Rebuild Index
          </Button>
          <div className="relative">
            <input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={isUploading}
              accept=".pdf,.docx,.txt"
              ref={fileInputRef}
            />
            <Button disabled={isUploading}>
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </div>
      </div>

      {/* Search + Filter bar — only shown when there are documents */}
      {hasDocuments && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search documents by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 shrink-0">
            {STATUS_FILTERS.map(({ value, label }) => {
              const count = counts[value];
              const isActive = statusFilter === value;
              if (value !== "all" && count === 0) return null;
              return (
                <button
                  key={value}
                  onClick={() => setStatusFilter(value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                  <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center ${
                    isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Results count when filtering */}
      {isFiltering && hasDocuments && (
        <p className="text-sm text-muted-foreground mb-3">
          {hasResults
            ? <>Showing <span className="font-medium text-foreground">{filtered.length}</span> of {counts.all} documents</>
            : "No documents match your search."}
          {isFiltering && (
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); }}
              className="ml-2 text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </p>
      )}

      {/* Document table */}
      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !hasDocuments ? (
          <div className="text-center py-16 px-6">
            <div className="mx-auto w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
              <File className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No documents found</h3>
            <p className="text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">
              Upload course catalogs, policy manuals, or faculty guidelines to build the knowledge base.
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload First Document
            </Button>
          </div>
        ) : !hasResults ? (
          <div className="text-center py-12 px-6">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-foreground font-medium">No documents match your search</p>
            <p className="text-muted-foreground text-sm mt-1">Try a different name or clear the filters.</p>
            <Button variant="outline" className="mt-4" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
              Clear filters
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="w-[42%]">Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => (
                <TableRow key={doc.id} className="group">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-md bg-primary/8 flex items-center justify-center shrink-0">
                        <File className="h-4 w-4 text-primary/60" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate max-w-[240px] text-sm font-medium" title={doc.originalName}>
                          {doc.originalName}
                        </p>
                        <p className="text-xs text-muted-foreground">ID #{doc.id}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(doc.status, doc.errorMessage)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-mono text-[11px]">
                      {getMimeLabel(doc.mimeType)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{formatFileSize(doc.fileSize)}</TableCell>
                  <TableCell>
                    {doc.chunkCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        {doc.chunkCount.toLocaleString()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                    {format(new Date(doc.createdAt), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
