import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, BookOpen, Hash, BarChart2 } from "lucide-react";

interface Citation {
  documentName: string;
  pageNumber: number | null;
  chunkText: string;
  score: number;
}

interface CitationDrawerProps {
  open: boolean;
  onClose: () => void;
  citation: Citation | null;
  citationIndex: number;
  question: string;
}

function highlightPassage(text: string, query: string): React.ReactNode[] {
  if (!query.trim()) return [text];

  const stopWords = new Set([
    "a","an","the","is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","could","should","may","might","shall","can",
    "to","of","in","for","on","with","at","by","from","up","about","into","through",
    "i","me","my","you","your","we","our","they","it","its","this","that","what",
    "which","who","how","when","where","why","and","or","but","not","if","then","so"
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (keywords.length === 0) return [text];

  const pattern = new RegExp(`(${keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, i) => {
    if (pattern.test(part)) {
      pattern.lastIndex = 0;
      return (
        <mark
          key={i}
          className="bg-amber-200 text-amber-900 rounded-sm px-0.5 font-medium not-italic"
        >
          {part}
        </mark>
      );
    }
    pattern.lastIndex = 0;
    return part;
  });
}

function confidenceLabel(score: number): { label: string; color: string } {
  if (score >= 4) return { label: "High relevance", color: "text-emerald-600 bg-emerald-50 border-emerald-200" };
  if (score >= 1.5) return { label: "Moderate relevance", color: "text-amber-600 bg-amber-50 border-amber-200" };
  return { label: "Low relevance", color: "text-slate-500 bg-slate-50 border-slate-200" };
}

export default function CitationDrawer({ open, onClose, citation, citationIndex, question }: CitationDrawerProps) {
  if (!citation) return null;

  const { label, color } = confidenceLabel(citation.score);
  const highlighted = highlightPassage(citation.chunkText, question);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary">
              Source [{citationIndex + 1}]
            </Badge>
            <Badge variant="outline" className={`text-xs border font-medium ${color}`}>
              {label}
            </Badge>
          </div>
          <SheetTitle className="font-serif text-xl text-left leading-tight flex items-start gap-2">
            <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            {citation.documentName}
          </SheetTitle>

          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            {citation.pageNumber && (
              <span className="flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" />
                Page {citation.pageNumber}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              {citation.chunkText.split(/\s+/).length} words
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart2 className="h-3.5 w-3.5" />
              Score {citation.score.toFixed(2)}
            </span>
          </div>
        </SheetHeader>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <span className="font-semibold">Highlighted:</span> keywords from your question are marked in the passage below.
          </div>
        </div>

        <ScrollArea className="flex-1 px-6 pb-6">
          <Separator className="mb-4" />
          <div className="text-sm leading-relaxed text-foreground font-serif tracking-wide whitespace-pre-wrap">
            {highlighted}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
