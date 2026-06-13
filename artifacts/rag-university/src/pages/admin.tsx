import { useGetAnalyticsStats, useGetTopQuestions } from "@workspace/api-client-react";
import { Library, MessageSquare, Files, Zap, HelpCircle, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPage() {
  const { data: stats, isLoading: statsLoading } = useGetAnalyticsStats();
  const { data: topQuestions, isLoading: questionsLoading } = useGetTopQuestions();

  const statCards = [
    {
      title: "Total Documents",
      value: stats?.totalDocuments ?? 0,
      description: "Indexed in knowledge base",
      icon: Files,
      color: "text-blue-500",
      bg: "bg-blue-500/10"
    },
    {
      title: "Knowledge Chunks",
      value: stats?.totalChunks ?? 0,
      description: "Vector embeddings generated",
      icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-500/10"
    },
    {
      title: "Questions Answered",
      value: stats?.totalQuestions ?? 0,
      description: `${stats?.questionsToday ?? 0} asked today`,
      icon: MessageSquare,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10"
    },
    {
      title: "Avg. Confidence",
      value: stats?.avgConfidence ? `${(stats.avgConfidence * 100).toFixed(1)}%` : "0%",
      description: "Retrieval score accuracy",
      icon: TrendingUp,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10"
    }
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-serif font-bold text-foreground tracking-tight">Admin Insights</h1>
        <p className="text-muted-foreground mt-1">Platform usage, knowledge base health, and user behavior analytics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? (
          Array(4).fill(0).map((_, i) => (
            <Card key={i} className="border-border">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          statCards.map((stat, i) => (
            <Card key={i} className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${stat.bg}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2 border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              Top Questions
            </CardTitle>
            <CardDescription>Most frequently asked questions by students</CardDescription>
          </CardHeader>
          <CardContent>
            {questionsLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : topQuestions?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No questions asked yet.
              </div>
            ) : (
              <div className="space-y-4">
                {topQuestions?.map((tq, i) => (
                  <div key={i} className="flex items-start justify-between border-b border-border last:border-0 pb-4 last:pb-0">
                    <div className="flex gap-4">
                      <div className="font-mono text-muted-foreground text-sm mt-0.5">{(i + 1).toString().padStart(2, '0')}</div>
                      <p className="text-sm font-medium text-foreground">{tq.question}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold bg-secondary text-secondary-foreground px-2 py-1 rounded-md">
                        {tq.count}x
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-primary/5 border-primary/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Library className="h-5 w-5" />
              System Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Index Health</span>
                  <span className="text-sm text-green-600 font-medium">Optimal</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: '100%' }}></div>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Helpful Feedback Rate</span>
                  <span className="text-sm text-primary font-medium">
                    {stats?.helpfulRate ? `${(stats.helpfulRate * 100).toFixed(0)}%` : 'N/A'}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${(stats?.helpfulRate || 0) * 100}%` }}></div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/50">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The retrieval system is currently utilizing chunked vector embeddings. To ensure the highest accuracy, rebuild the index after bulk document uploads.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
