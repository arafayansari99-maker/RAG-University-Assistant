import { useState, useRef } from "react";
import { useListDocuments, useDeleteDocument, useRebuildIndex, getListDocumentsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Upload, Trash2, RefreshCw, File, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data: documents, isLoading } = useListDocuments();
  const deleteDoc = useDeleteDocument();
  const rebuildIndex = useRebuildIndex();

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
      
      toast({ title: "Document uploaded", description: "The document is now being processed." });
      queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
    } catch (error) {
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
      }
    });
  };

  const handleRebuild = () => {
    rebuildIndex.mutate(undefined, {
      onSuccess: (res) => {
        toast({ 
          title: "Index Rebuilt", 
          description: `Successfully indexed ${res.chunksIndexed} chunks.` 
        });
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey() });
      },
      onError: () => {
        toast({ title: "Rebuild failed", variant: "destructive" });
      }
    });
  };

  const getStatusBadge = (status: string, error?: string | null) => {
    switch(status) {
      case 'ready':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1"><Clock className="h-3 w-3 animate-spin-slow" /> Processing</Badge>;
      case 'error':
        return <Badge variant="destructive" title={error || "Unknown error"} className="gap-1"><AlertCircle className="h-3 w-3" /> Error</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Library & Index</h1>
          <p className="text-muted-foreground mt-1">Manage knowledge base documents and search index.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            onClick={handleRebuild}
            disabled={rebuildIndex.isPending}
            className="border-border text-foreground hover:bg-secondary"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${rebuildIndex.isPending ? 'animate-spin' : ''}`} />
            Rebuild Index
          </Button>
          
          <div className="relative">
            <input 
              type="file" 
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={handleFileChange}
              disabled={isUploading}
              accept=".pdf,.txt,.md,.csv"
              ref={fileInputRef}
            />
            <Button className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : documents?.length === 0 ? (
          <div className="text-center py-16 px-6">
            <div className="mx-auto w-16 h-16 bg-secondary rounded-full flex items-center justify-center mb-4">
              <File className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No documents found</h3>
            <p className="text-muted-foreground mt-1 mb-6 max-w-sm mx-auto">Upload documents like course catalogs, policy manuals, or faculty guidelines to build the knowledge base.</p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload First Document
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-secondary/50">
              <TableRow>
                <TableHead className="w-[40%]">Filename</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Chunks</TableHead>
                <TableHead>Added</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents?.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-muted-foreground" />
                      <span className="truncate max-w-[250px]" title={doc.originalName}>{doc.originalName}</span>
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(doc.status, doc.errorMessage)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatFileSize(doc.fileSize)}</TableCell>
                  <TableCell className="text-muted-foreground">{doc.chunkCount}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => handleDelete(doc.id)}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
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
