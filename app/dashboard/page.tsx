"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Play,
  RefreshCw,
  PlusCircle,
  ExternalLink,
  DollarSign,
  Activity,
  Layers,
  Sparkles,
  Info,
  Mail,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "@/components/dashboard/risk-badge";
import { ReportSection } from "@/components/dashboard/report-section";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { DetailsModal } from "@/components/dashboard/details-modal";
import { InteractiveScannerModal } from "@/components/dashboard/interactive-scanner-modal";
import { SkeletonCard, EmptyState, ErrorState } from "@/components/dashboard/dashboard-states";
import { formatCurrency } from "@/lib/utils";
import type { RiskReport, RiskLevel } from "@/types/invoice";
import { SecurityConsole } from "@/components/dashboard/security-console";
import { InvoiceFraudDemo } from "@/components/dashboard/invoice-fraud-demo";

export default function DashboardPage() {
  const [reports, setReports] = useState<RiskReport[]>([]);
  const [reportMetrics, setReportMetrics] = useState<{
    totalAnalyzed: number;
    quarantinedCount: number;
    needsReviewCount: number;
    safeCount: number;
    flaggedAmount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLevel, setSelectedLevel] = useState<"ALL" | RiskLevel>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReport, setSelectedReport] = useState<RiskReport | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [gmailStatus, setGmailStatus] = useState<
    { state: "loading" | "unavailable" } | { state: "loaded"; connected: boolean; email?: string }
  >({ state: "loading" });

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Fetch reports from API
  const fetchReports = useCallback(async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    try {
      const res = await fetch("/api/reports?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch risk reports`);
      const data = await res.json();
      setReports(data.items || []);
      setReportMetrics(data.metrics);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error fetching reports");
    } finally {
      if (isInitial) setIsLoading(false);
    }
  }, []);

  // Fetch on mount and poll every 15 seconds
  useEffect(() => {
    fetchReports(true);
    const interval = setInterval(() => {
      fetchReports(false);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchReports]);

  useEffect(() => {
    let active = true;
    fetch("/api/gmail/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gmail status unavailable.");
        return response.json();
      })
      .then((data: { connected: boolean; email?: string }) => {
        if (active) setGmailStatus({ state: "loaded", connected: data.connected, email: data.email });
      })
      .catch(() => {
        if (active) setGmailStatus({ state: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, []);

  // Handle Mark as Safe / Report Scam feedback with optimistic update
  const handleFeedback = async (reportId: string, action: "MARK_SAFE" | "REPORT_SCAM") => {
    const previousReports = [...reports];

    // Optimistic state update
    const targetReport = reports.find((r) => r.id === reportId);
    const newLevel: RiskLevel = action === "MARK_SAFE" ? "SAFE" : "QUARANTINE";
    const newActionText =
      action === "MARK_SAFE"
        ? "Approved & marked safe by user authorization."
        : "Reported as verified scam by user. Do not pay.";

    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              risk_level: newLevel,
              recommended_action: newActionText,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );

    if (selectedReport && selectedReport.id === reportId) {
      setSelectedReport((prev) =>
        prev
          ? {
              ...prev,
              risk_level: newLevel,
              recommended_action: newActionText,
            }
          : null
      );
    }

    try {
      const res = await fetch(`/api/reports/${reportId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        throw new Error("Feedback request failed.");
      }

      setToast({
        message:
          action === "MARK_SAFE"
            ? "Transaction cleared and sender recorded as safe."
            : "Scam report confirmed. Threat quarantined.",
        type: "success",
      });

      // Refetch to ensure synced timestamps
      await fetchReports(false);
    } catch (err) {
      // Rollback on failure
      setReports(previousReports);
      setToast({
        message: "Failed to record feedback. Action rolled back.",
        type: "error",
      });
    }
  };

  // Run dev simulator
  const handleSimulate = async (scenario: "safe" | "suspicious" | "scam") => {
    setSimulating(scenario);
    try {
      const res = await fetch("/api/dev/simulate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario }),
      });
      if (!res.ok) throw new Error("Simulation failed");
      await fetchReports(false);
      setToast({
        message: `Simulated ${scenario.toUpperCase()} invoice generated and evaluated.`,
        type: "success",
      });
    } catch (err) {
      setToast({
        message: "Simulation error: Check server logs.",
        type: "error",
      });
    } finally {
      setSimulating(null);
    }
  };

  // Summary metrics cover all persisted reports; the feed below shows the latest 100.
  const quarantinedReports = reports.filter((r) => r.risk_level === "QUARANTINE");
  const needsReviewReports = reports.filter((r) => r.risk_level === "NEEDS_REVIEW");
  const safeReports = reports.filter((r) => r.risk_level === "SAFE");

  const totalAnalyzed = reportMetrics?.totalAnalyzed ?? 0;
  const quarantinedCount = reportMetrics?.quarantinedCount ?? quarantinedReports.length;
  const needsReviewCount = reportMetrics?.needsReviewCount ?? needsReviewReports.length;
  const safeCount = reportMetrics?.safeCount ?? safeReports.length;
  const flaggedAmount = reportMetrics?.flaggedAmount
    ?? quarantinedReports.reduce((acc, r) => acc + r.amount, 0);

  // Filter and search computation
  const filteredReports = reports.filter((report) => {
    // Level filter
    if (selectedLevel !== "ALL" && report.risk_level !== selectedLevel) {
      return false;
    }

    // Search query filter (sender, invoice_id, content)
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      const inSender = report.sender.toLowerCase().includes(q);
      const inInvoiceId = (report.invoice_id || "").toLowerCase().includes(q);
      const inContent = report.content.toLowerCase().includes(q);
      return inSender || inInvoiceId || inContent;
    }

    return true;
  });

  const isDevMode = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-8">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              INVOICE ANALYSIS ACTIVE
            </span>
            <span className="text-xs text-zinc-500 font-mono">PayPal Sandbox Mode</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">
            PayShield Security Console
          </h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Gmail invoice monitoring uses reversible labels. PayPal checks run in Sandbox; payments are never approved or sent.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/api/gmail/connect">
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs"
              title={
                gmailStatus.state === "loaded" && gmailStatus.connected
                  ? `Connected: ${gmailStatus.email || "Gmail account"}`
                  : undefined
              }
            >
              <Mail className="h-3.5 w-3.5" />
              <span>
                {gmailStatus.state === "unavailable"
                  ? "Gmail status unavailable"
                  : gmailStatus.state === "loaded" && gmailStatus.connected
                    ? `Reconnect ${gmailStatus.email || "Gmail"}`
                    : "Connect Gmail"}
              </span>
            </Button>
          </Link>
          <Button
            variant="primary"
            size="sm"
            className="gap-1.5 text-xs shadow-md shadow-blue-500/20"
            onClick={() => setIsScannerOpen(true)}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            <span>Test AI Scam Scanner</span>
          </Button>
          <Link
            href="https://developer.paypal.com/dashboard/applications/sandbox"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
              <span>PayPal Sandbox Console</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Toast Alert Banner */}
      {toast && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between transition-all ${
            toast.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}
        >
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="text-zinc-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      <InvoiceFraudDemo />

      <SecurityConsole />

      {/* Dynamic invoice stats from persisted risk report data */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-zinc-200/80 dark:border-zinc-800 p-5">
          <div className="flex items-center justify-between text-zinc-500 text-xs">
            <span>Total Analyzed</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-100 mt-2 font-mono">
            {isLoading ? "--" : totalAnalyzed}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Processed by deterministic rules &amp; AI</p>
        </Card>

        <Card className="border-red-500/30 bg-red-950/10 p-5">
          <div className="flex items-center justify-between text-red-400 text-xs">
            <span>Quarantined Threats</span>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-extrabold text-red-400 mt-2 font-mono">
            {isLoading ? "--" : quarantinedCount}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">High-risk reports labeled for quarantine</p>
        </Card>

        <Card className="border-amber-500/30 bg-amber-950/10 p-5">
          <div className="flex items-center justify-between text-amber-400 text-xs">
            <span>Needs Review</span>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 mt-2 font-mono">
            {isLoading ? "--" : needsReviewCount}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Borderline transactions flagged</p>
        </Card>

        <Card className="border-emerald-500/30 bg-emerald-950/10 p-5">
          <div className="flex items-center justify-between text-emerald-400 text-xs">
            <span>Risk-Flagged Amount</span>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-400 mt-2 font-mono">
            {isLoading ? "--" : formatCurrency(flaggedAmount)}
          </div>
          <p className="text-[11px] text-zinc-400 mt-1">Amounts flagged, not funds blocked</p>
        </Card>
      </div>

      {/* DEV ONLY Simulator Button Group (Only rendered when NODE_ENV !== "production") */}
      {isDevMode && (
        <Card className="border-blue-500/25 bg-blue-950/20 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Dev Sandbox Simulator</span>
              </div>
              <p className="text-xs text-zinc-300">
                Trigger mock incoming webhook invoices across threat vectors to test rule evaluation and defense in real time.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="secondary"
                size="sm"
                disabled={simulating !== null}
                onClick={() => handleSimulate("safe")}
                className="text-xs h-8 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
              >
                {simulating === "safe" ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                <span>+ Simulate Safe</span>
              </Button>

              <Button
                variant="secondary"
                size="sm"
                disabled={simulating !== null}
                onClick={() => handleSimulate("suspicious")}
                className="text-xs h-8 text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
              >
                {simulating === "suspicious" ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                <span>+ Simulate Suspicious</span>
              </Button>

              <Button
                variant="destructive"
                size="sm"
                disabled={simulating !== null}
                onClick={() => handleSimulate("scam")}
                className="text-xs h-8"
              >
                {simulating === "scam" ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                <span>+ Simulate Scam Trap</span>
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <FilterBar
        selectedLevel={selectedLevel}
        onSelectLevel={setSelectedLevel}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        counts={{
          all: totalAnalyzed,
          quarantine: quarantinedCount,
          needsReview: needsReviewCount,
          safe: safeCount,
        }}
      />

      {/* Main Content Areas */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={() => fetchReports(true)} />
      ) : selectedLevel === "ALL" && !searchQuery ? (
        // When viewing all and no search query, group by sections
        <div className="space-y-10">
          <ReportSection
            title="Quarantined Threats"
            count={quarantinedCount}
            reports={quarantinedReports}
            icon={<ShieldAlert className="h-5 w-5 text-red-500" />}
            emptyTitle="No Quarantined Invoices"
            emptyDescription="All incoming transactions are currently clear of critical scam indicators."
            onViewDetails={setSelectedReport}
            onFeedback={handleFeedback}
          />

          <ReportSection
            title="Needs Review"
            count={needsReviewCount}
            reports={needsReviewReports}
            icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
            emptyTitle="No Invoices Requiring Review"
            emptyDescription="There are currently no borderline or suspicious transactions pending review."
            onViewDetails={setSelectedReport}
            onFeedback={handleFeedback}
          />

          <ReportSection
            title="Safe & Cleared Invoices"
            count={safeCount}
            reports={safeReports}
            icon={<ShieldCheck className="h-5 w-5 text-emerald-500" />}
            emptyTitle="No Safe Invoices Recorded"
            emptyDescription="Run a scan or simulation to evaluate standard payment requests."
            onViewDetails={setSelectedReport}
            onFeedback={handleFeedback}
          />
        </div>
      ) : (
        // When filtered by specific level or actively searching
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
            <span>
              Showing {filteredReports.length} {filteredReports.length === 1 ? "report" : "reports"}
              {searchQuery ? ` matching "${searchQuery}"` : ""}
            </span>
          </div>

          {filteredReports.length === 0 ? (
            <EmptyState
              title="No transactions match your search"
              description="Try adjusting your filter or search keywords."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((report) => (
                <ReportSection
                  key={report.id}
                  title=""
                  count={1}
                  reports={[report]}
                  onViewDetails={setSelectedReport}
                  onFeedback={handleFeedback}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      <DetailsModal
        isOpen={selectedReport !== null}
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onFeedback={(action) => {
          if (selectedReport) {
            handleFeedback(selectedReport.id, action);
          }
        }}
      />

      {/* Interactive Scam Scanner Modal */}
      <InteractiveScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanComplete={() => {
          fetchReports(false);
        }}
      />
    </div>
  );
}
