import AdminLayout from "@/components/AdminLayout";
import { useAiHealthReports, useRouters, useActiveSessions, useErrorLogs } from "@/hooks/useDatabase";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle, AlertTriangle, XCircle, RefreshCw, Lightbulb, Activity, Wifi, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

const statusIcon: Record<string, React.ReactNode> = {
  ok:       <CheckCircle className="h-4 w-4 text-success" />,
  warning:  <AlertTriangle className="h-4 w-4 text-warning" />,
  critical: <XCircle className="h-4 w-4 text-destructive" />,
};

const statusStyle: Record<string, string> = {
  ok:       "border-success/30 bg-success/5",
  warning:  "border-warning/30 bg-warning/5",
  critical: "border-destructive/30 bg-destructive/5",
};

const overallStyles: Record<string, string> = {
  healthy:  "bg-success/15 text-success border-success/30",
  warning:  "bg-warning/15 text-warning border-warning/30",
  critical: "bg-destructive/15 text-destructive border-destructive/30",
};

const AIHealthPage = () => {
  const queryClient = useQueryClient();
  const { data: report }   = useAiHealthReports();
  const { data: routers = [] }  = useRouters();
  const { data: sessions = [] } = useActiveSessions();
  const { data: errorLogs = [] } = useErrorLogs();

  const rtrs   = routers  as Record<string, unknown>[];
  const sess   = sessions as Record<string, unknown>[];
  const errors = errorLogs as Record<string, unknown>[];

  // Derive live health checks from real data
  const liveChecks = useMemo(() => {
    const onlineRouters  = rtrs.filter(r => r.status === "online").length;
    const totalRouters   = rtrs.length;
     const recentErrors   = errors.filter(e => new Date(e.created_at) > new Date(Date.now() - 3600_000)).length;

    return [
      {
        component: "Active Sessions",
        metric:    "Count",
        value:     String(sess.length),
        threshold: "< 5000",
        status:    sess.length < 5000 ? "ok" : sess.length < 8000 ? "warning" : "critical",
      },
      {
        component: "Routers Online",
        metric:    "Online/Total",
        value:     `${onlineRouters}/${totalRouters}`,
        threshold: "All online",
        status:    onlineRouters === totalRouters ? "ok" : onlineRouters > 0 ? "warning" : "critical",
      },
      {
        component: "Error Rate (1h)",
        metric:    "Recent Errors",
        value:     String(recentErrors),
        threshold: "< 10/hr",
        status:    recentErrors < 10 ? "ok" : recentErrors < 50 ? "warning" : "critical",
      },
      {
        component: "Data Freshness",
        metric:    "Last AI Report",
        value:     report ? new Date(report.created_at).toLocaleTimeString() : "Never",
        threshold: "< 1 hour old",
        status:    report && new Date(report.created_at) > new Date(Date.now() - 3600_000) ? "ok" : "warning",
      },
    ];
  }, [rtrs, sess, errors, report]);

  const overallStatus = liveChecks.some(c => c.status === "critical") ? "critical"
    : liveChecks.some(c => c.status === "warning") ? "warning" : "healthy";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">AI System Health Monitor</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Live health checks powered by real network data</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={`${overallStyles[overallStatus]} capitalize`}>{overallStatus}</Badge>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => queryClient.invalidateQueries()}>
              <RefreshCw className="h-4 w-4" />Refresh
            </Button>
          </div>
        </div>

        {/* AI Summary from DB or live derived */}
        <div className="glass-card p-5 border-l-4 border-l-primary">
          <div className="flex items-start gap-3">
            <Activity className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold mb-2">System Health Summary</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {report?.summary ?? (
                  `Network is ${overallStatus}. ${rtrs.filter(r => r.status === "online").length} of ${rtrs.length} routers online, ${sess.length} active sessions, ${errors.filter(e => new Date(e.created_at) > new Date(Date.now() - 3600_000)).length} errors in the last hour.`
                )}
              </p>
              {report?.created_at && (
                <p className="text-[10px] text-muted-foreground mt-2">Last AI analysis: {new Date(report.created_at).toLocaleString()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Live Health Checks */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Live Health Checks</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 sm:grid-cols-4 gap-3">
            {liveChecks.map((check, i) => (
              <div key={i} className={`rounded-lg border p-4 ${statusStyle[check.status]}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold">{check.component}</span>
                  {statusIcon[check.status]}
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{check.metric}</span>
                    <span className="font-semibold">{check.value}</span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-muted-foreground">Target</span>
                    <span className="text-muted-foreground">{check.threshold}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        {report?.recommendations && (
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lightbulb className="h-5 w-5 text-warning" />
              <h3 className="text-sm font-semibold">AI Recommendations</h3>
            </div>
            <div className="space-y-3">
              {(report.recommendations as string[]).map((rec, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                  <span className="h-5 w-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">{i + 1}</span>
                  <p className="text-sm text-muted-foreground">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Features */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold mb-4">Available AI Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { title: "Revenue Prediction", desc: "AI forecasts next month's revenue based on trends" },
              { title: "Churn Prediction",   desc: "Identifies users likely to not renew" },
              { title: "Ticket Auto-Classify", desc: "Categorizes tickets by type & priority" },
              { title: "Network Diagnosis",  desc: "Ask AI about router performance issues" },
              { title: "Anomaly Detection",  desc: "Flags unusual traffic and payment patterns" },
              { title: "Error Trends",       desc: "AI-powered analysis of error patterns" },
              { title: "MikroTik Scripts",   desc: "AI generates RouterOS scripts from prompts" },
              { title: "Customer Insights",  desc: "Behavioral analysis & segmentation" },
            ].map((feat) => (
              <div key={feat.title} className="p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors cursor-pointer">
                <p className="text-xs font-semibold">{feat.title}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{feat.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AIHealthPage;
