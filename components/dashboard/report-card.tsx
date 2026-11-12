"use client";

import { useState } from "react";
import { CheckCircle2, ShieldAlert, Eye, DollarSign, Calendar, Mail, ShieldCheck, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "./risk-badge";
import { WhyFlaggedPanel } from "./why-flagged-panel";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RiskReport } from "@/types/invoice";

interface ReportCardProps {
  report: RiskReport;
  onViewDetails: (report: RiskReport) => void;
  onFeedback: (reportId: string, action: "MARK_SAFE" | "REPORT_SCAM") => Promise<void>;
}

export function ReportCard({ report, onViewDetails, onFeedback }: ReportCardProps) {
  const [loadingAction, setLoadingAction] = useState<"MARK_SAFE" | "REPORT_SCAM" | null>(null);

  const isQuarantine = report.risk_level === "QUARANTINE";
  const previewText =
    report.content.length > 80 ? `${report.content.slice(0, 80)}...` : report.content;

  const handleAction = async (action: "MARK_SAFE" | "REPORT_SCAM") => {
    setLoadingAction(action);
    try {
      await onFeedback(report.id, action);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 hover:shadow-lg ${
        isQuarantine
          ? "border-red-500/40 bg-gradient-to-b from-red-950/15 via-zinc-900/40 to-zinc-900/60"
          : report.risk_level === "NEEDS_REVIEW"
          ? "border-amber-500/30 bg-zinc-900/60"
          : "border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/60"
      }`}
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <RiskBadge level={report.risk_level} />
              <span className="text-xs font-mono text-zinc-400 truncate">
                {report.invoice_id || "Direct Request"}
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
              From: <span className="text-zinc-300 font-mono">{report.sender}</span>
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {formatCurrency(report.amount)}
            </div>
            <div className="text-[10px] text-zinc-500">
              {report.paypal_verified ? (
                <span className="text-emerald-400 font-medium">● Verified Sandbox</span>
              ) : (
                <span className="text-zinc-400">○ Unverified Sandbox</span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-1 space-y-4 text-xs">
        {/* Risk Score Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] text-zinc-400">
            <span>Risk Score: {report.risk_score} / 100</span>
            <span className="font-semibold text-zinc-300">{report.category}</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                report.risk_score >= 85
                  ? "bg-red-500"
                  : report.risk_score >= 55
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(5, report.risk_score))}%` }}
            />
          </div>
        </div>

        {/* Note / Memo preview */}
        <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800/80 font-mono text-[11px] text-zinc-300">
          &ldquo;{previewText}&rdquo;
        </div>

        {/* Why Flagged Panel shown automatically on quarantine items */}
        {isQuarantine && (
          <WhyFlaggedPanel reasons={report.reasons} className="mt-2 text-[11px]" />
        )}

        {/* Top reasons preview for non-quarantine */}
        {!isQuarantine && report.reasons.length > 0 && (
          <ul className="space-y-1 text-zinc-400 text-[11px]">
            {report.reasons.slice(0, 2).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-500 mt-1 shrink-0" />
                <span className="truncate">{r}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Created At & Recommended Action */}
        <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-800/60">
          <span>{formatDate(report.created_at)}</span>
          <span className="text-zinc-400 italic truncate max-w-[200px]">
            AI Conf: {report.ai_confidence}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onViewDetails(report)}
            className="flex-1 gap-1 text-xs h-8"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Details</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            disabled={loadingAction !== null}
            onClick={() => handleAction("MARK_SAFE")}
            className="gap-1 text-xs h-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/20"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Safe</span>
          </Button>

          <Button
            variant="destructive"
            size="sm"
            disabled={loadingAction !== null}
            onClick={() => handleAction("REPORT_SCAM")}
            className="gap-1 text-xs h-8"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>Scam</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
