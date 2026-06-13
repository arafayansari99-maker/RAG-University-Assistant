import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { useListDocuments, useDeleteDocument, useRebuildIndex, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Upload, Trash2, RefreshCw, File, AlertCircle, CheckCircle2,
  Clock, Search, X, FileText, Layers, FolderOpen, CloudUpload,
  CheckCheck, LoaderCircle, ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = "all" | "ready" | "processing" | "error";

interface QueueItem {
  id: string;
  name: string;
  size: number;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "processing", label: "Processing" },
  { value: "error", label: "Error" },
];

const ALLOWED_EXT = [".pdf", ".docx", ".txt"];
const ALLOWED_MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
];

function isAllowed(file: File) {
  if (ALLOWED_MIME.includes(file.type)) return true;
  const lower = file.name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

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

// ─── Upload Queue Panel ───────────────────────────────────────────────────────

function UploadQueuePanel({ queue, onClear }: { queue: QueueItem[]; onClear: () => void }) {
  if (queue.length === 0) return null;

  const done = queue.filter((q) => q.status === "done").length;
  const errors = queue.filter((q) => q.status === "error").length;
  const active = queue.filter((q) => q.status === "uploading").length;
  const total = queue.length;
  const allDone = done + errors === total;
  const progress = Math.round(((done + errors) / total) * 100);

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 bg-card border border-border rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          {active > 0 ? (
            <LoaderCircle className="h-4 w-4 text-primary animate-spin" />
          ) : allDone && errors === 0 ? (
            <CheckCheck className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 text-amber-500" />
          )}
          <span className="text-sm font-medium">
            {active > 0
              ? `Uploading ${active} file${active !== 1 ? "s" : ""}…`
              : allDone && errors === 0
              ? `${total} file${total !== 1 ? "s" : ""} uploaded`
              : `${done} of ${total} uploaded${errors > 0 ? `, ${errors} failed` : ""}`}
          </span>
        </div>
        {allDone && (
          <button onClick={onClear} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <Progress value={progress} className="h-1 rounded-none" />

      {/* File list */}
      <div className="max-h-52 overflow-y-auto">
        {queue.map((item) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
            <div className="shrink-0">
              {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              {item.status === "error" && <span title={item.error}><AlertCircle className="h-4 w-4 text-destructive" /></span>}
              {item.status === "uploading" && <LoaderCircle className="h-4 w-4 text-primary animate-spin" />}
              {item.status === "pending" && <Clock className="h-4 w-4 text-muted-foreground" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{item.name}</p>
              {item.status === "error" && (
                <p className="text-[10px] text-destructive truncate">{item.error ?? "Upload failed"}</p>
              )}
              {item.status !== "error" && (
                <p className="text-[10px] text-muted-foreground">{formatSize(item.size)}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const dragCounterRef = useRef(0);

  const { data: documents, isLoading } = useListDocuments({
    query: {
      queryKey: getListDocumentsQueryKey(),
      refetchInterval: (query) => {
        const docs = query.state.data;
        if (!docs) return false;
        return docs.some((d) => d.status === "processing") ? 2500 : false;
      },
    },
  });
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

  // ─── Upload logic ────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: File[]) => {
    const allowed = files.filter(isAllowed);
    const skipped = files.length - allowed.length;

    if (allowed.length === 0) {
      toast({ title: "No valid files", description: "Only PDF, DOCX, and TXT files are supported.", variant: "destructive" });
      return;
    }
    if (skipped > 0) {
      toast({ title: `${skipped} file${skipped !== 1 ? "s" : ""} skipped`, description: "Only PDF, DOCX, and TXT files are supported." });
    }

    const newItems: QueueItem[] = allowed.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: file.name,
      size: file.size,
      file,
      status: "pending",
    }));

    setQueue((prev) => [...prev, ...newItems]);

    for (const item of newItems) {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "uploading" } : q));

      const formData = new FormData();
      formData.append("file", item.file);

      try {
        const res = await fetch(`${import.meta.env.BASE_URL}api/documents`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Upload failed");
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "done" } : q));
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      } catch (err) {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: "error", error: String(err).replace("Error: ", "") } : q));
      }
    }
  }, [queryClient]);

  // ─── File input handlers ─────────────────────────────────────────────────────

  const handleFilesInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) uploadFiles(files);
    e.target.value = "";
  };

  // ─── Drag and drop ───────────────────────────────────────────────────────────

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files: File[] = [];

    // Use DataTransferItemList to support folders
    const items = Array.from(e.dataTransfer.items);
    const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
      if (entry.isFile) {
        return new Promise((resolve) => {
          (entry as FileSystemFileEntry).file(
            (f) => resolve([f]),
            () => resolve([])
          );
        });
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        return new Promise((resolve) => {
          const result: File[] = [];
          const readBatch = () => {
            reader.readEntries(async (entries) => {
              if (entries.length === 0) { resolve(result); return; }
              for (const sub of entries) {
                const subFiles = await readEntry(sub);
                result.push(...subFiles);
              }
              readBatch();
            }, () => resolve(result));
          };
          readBatch();
        });
      }
      return Promise.resolve([]);
    };

    for (const item of items) {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        const entryFiles = await readEntry(entry);
        files.push(...entryFiles);
      } else if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }

    if (files.length > 0) uploadFiles(files);
  }, [uploadFiles]);

  // ─── Other handlers ──────────────────────────────────────────────────────────

  // Clear selection when filtered list changes (e.g. search/filter)
  const prevFilteredIds = useMemo(() => new Set(filtered.map((d) => d.id)), [filtered]);

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleSelectAll = () => {
    const visibleIds = filtered.map((d) => d.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...visibleIds]));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleDelete = (id: number) => {
    deleteDoc.mutate({ id }, {
      onSuccess: () => {
        setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
        toast({ title: "Document deleted" });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      },
    });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds).filter((id) => prevFilteredIds.has(id));
    if (ids.length === 0) return;
    setIsBulkDeleting(true);
    let deleted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await new Promise<void>((resolve, reject) => {
          deleteDoc.mutate({ id }, { onSuccess: () => resolve(), onError: () => reject() });
        });
        deleted++;
      } catch {
        failed++;
      }
    }
    setIsBulkDeleting(false);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    toast({
      title: failed === 0
        ? `${deleted} document${deleted !== 1 ? "s" : ""} deleted`
        : `${deleted} deleted, ${failed} failed`,
      variant: failed > 0 ? "destructive" : "default",
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

  const hasDocuments = (documents?.length ?? 0) > 0;
  const hasResults = filtered.length > 0;
  const isFiltering = search !== "" || statusFilter !== "all";
  const isUploading = queue.some((q) => q.status === "uploading" || q.status === "pending");

  // Selection derived state
  const visibleSelectedCount = filtered.filter((d) => selectedIds.has(d.id)).length;
  const allVisibleSelected = filtered.length > 0 && filtered.every((d) => selectedIds.has(d.id));
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  return (
    <div
      className="p-6 md:p-8 max-w-6xl mx-auto relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden inputs */}
      <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt" className="hidden" onChange={handleFilesInput} />
      <input ref={folderInputRef} type="file" className="hidden" onChange={handleFilesInput}
        // @ts-expect-error webkitdirectory is non-standard
        webkitdirectory="" mozdirectory="" />

      {/* Drag overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          <div className="absolute inset-4 border-2 border-dashed border-primary rounded-2xl bg-primary/5 flex flex-col items-center justify-center gap-3">
            <CloudUpload className="h-12 w-12 text-primary" />
            <p className="text-lg font-semibold text-primary">Drop files or folders to upload</p>
            <p className="text-sm text-muted-foreground">PDF, DOCX, and TXT files supported</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Library & Index</h1>
          <p className="text-muted-foreground mt-1">Drag and drop files or folders — PDF, DOCX, TXT supported.</p>

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
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">{counts.processing} processing</Badge>
              )}
              {counts.error > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">{counts.error} error{counts.error !== 1 ? "s" : ""}</Badge>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <Button variant="outline" onClick={handleRebuild} disabled={rebuildIndex.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${rebuildIndex.isPending ? "animate-spin" : ""}`} />
            Rebuild Index
          </Button>
          <Button variant="outline" onClick={() => folderInputRef.current?.click()} disabled={isUploading}>
            <FolderOpen className="h-4 w-4 mr-2" />
            Upload Folder
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
            <Upload className="h-4 w-4 mr-2" />
            Upload Files
          </Button>
        </div>
      </div>

      {/* Search + Filter */}
      {hasDocuments && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search documents by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-9"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
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
                    isActive ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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

      {isFiltering && hasDocuments && (
        <p className="text-sm text-muted-foreground mb-3">
          {hasResults
            ? <>{`Showing `}<span className="font-medium text-foreground">{filtered.length}</span>{` of ${counts.all} documents`}</>
            : "No documents match your search."}
          <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="ml-2 text-primary hover:underline">
            Clear filters
          </button>
        </p>
      )}

      {/* Bulk-delete toolbar — slides in when rows are selected */}
      {visibleSelectedCount > 0 && (
        <div className="flex items-center justify-between gap-3 mb-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={toggleSelectAll}
              className="data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
              aria-label="Select all visible"
            />
            <span className="text-sm font-medium text-foreground">
              {visibleSelectedCount} of {filtered.length} selected
            </span>
            <button onClick={clearSelection} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
              Clear
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={isBulkDeleting}
            className="gap-2"
          >
            {isBulkDeleting ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete {visibleSelectedCount} document{visibleSelectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Document table / empty states */}
      <div className={`bg-card border rounded-xl shadow-sm overflow-hidden transition-colors ${isDragging ? "border-primary/50 bg-primary/5" : "border-border"}`}>
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !hasDocuments ? (
          /* Full-page drop zone when empty */
          <div
            className="text-center py-20 px-6 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="mx-auto w-20 h-20 bg-primary/8 border-2 border-dashed border-primary/30 rounded-2xl flex items-center justify-center mb-5">
              <CloudUpload className="h-9 w-9 text-primary/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground">Drop files here, or click to browse</h3>
            <p className="text-muted-foreground mt-1.5 mb-2 text-sm">
              Supports PDF, DOCX, and TXT — up to 20 MB per file
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              You can also drop an entire folder to upload all documents at once
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <Upload className="h-4 w-4 mr-2" /> Upload Files
              </Button>
              <Button variant="outline" onClick={(e) => { e.stopPropagation(); folderInputRef.current?.click(); }}>
                <FolderOpen className="h-4 w-4 mr-2" /> Upload Folder
              </Button>
            </div>
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
                <TableHead className="w-10 pl-4">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    className={someVisibleSelected ? "opacity-70" : ""}
                  />
                </TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const isSelected = selectedIds.has(doc.id);
                return (
                  <TableRow
                    key={doc.id}
                    className={`group cursor-pointer ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                    onClick={() => toggleSelect(doc.id)}
                  >
                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(doc.id)}
                        aria-label={`Select ${doc.originalName}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary/15" : "bg-primary/8"}`}>
                          <File className={`h-4 w-4 transition-colors ${isSelected ? "text-primary" : "text-primary/60"}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate max-w-[240px] text-sm font-medium" title={doc.originalName}>{doc.originalName}</p>
                          <p className="text-xs text-muted-foreground">ID #{doc.id}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(doc.status, doc.errorMessage)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-[11px]">{getMimeLabel(doc.mimeType)}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{formatSize(doc.fileSize)}</TableCell>
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
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
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
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Upload queue panel */}
      <UploadQueuePanel
        queue={queue}
        onClear={() => setQueue((q) => q.filter((i) => i.status !== "done" && i.status !== "error"))}
      />
    </div>
  );
}
