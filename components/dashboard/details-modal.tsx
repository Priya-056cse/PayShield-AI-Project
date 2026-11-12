"use client";

import { useEffect, useRef } from "react";
import { X, Calendar, DollarSign, Mail, ShieldAlert, CheckCircle, Bot, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "./risk-badge";
import { WhyFlaggedPanel } from "./why-flagged-panel";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { RiskReport } from "@/types/invoice";

interface DetailsModalProps {
  report: RiskReport | null;
  isOpen: boolean;
  onClose: () => void;
  onFeedback?: (action: "MARK_SAFE" | "REPORT_SCAM") => void;
}

export function DetailsModal({ report, isOpen, onClose, onFeedback }: DetailsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Accessible Escape key listener & focus management
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !report) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-8 space-y-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <RiskBadge level={report.risk_level} />
              <span className="text-xs font-mono text-zinc-400">
                {report.invoice_id || "No Invoice ID"}
              </span>
            </div>
            <h3 id="modal-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Transaction Threat Analysis
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Risk Score Progress Bar & Category */}
        <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800/80 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-600 dark:text-zinc-400">Risk Score Evaluation</span>
            <span className="font-mono font-bold text-base text-zinc-900 dark:text-zinc-100">
              {report.risk_score} / 100
            </span>
          </div>
          <div className="w-full h-2.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                report.risk_score >= 85
                  ? "bg-red-500"
                  : report.risk_score >= 55
                  ? "bg-amber-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(5, report.risk_score))}%` }}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
            <div>
              <span className="text-zinc-500 block">AI Threat Category:</span>
              <span className="font-semibold text-zinc-200">{report.category}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">AI Confidence:</span>
              <span className="font-semibold text-zinc-200">{report.ai_confidence}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">PayPal Sandbox:</span>
              <span className={`font-semibold ${report.paypal_verified ? "text-emerald-400" : "text-amber-400"}`}>
                {report.paypal_verified ? "Verified" : "Not Verified"}
              </span>
            </div>
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60">
            <Mail className="h-4 w-4 text-zinc-400 shrink-0" />
            <div className="truncate">
              <span className="text-zinc-500 block">Sender Address</span>
              <span className="font-mono text-zinc-200">{report.sender}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60">
            <DollarSign className="h-4 w-4 text-zinc-400 shrink-0" />
            <div>
              <span className="text-zinc-500 block">Amount Claimed</span>
              <span className="font-bold text-zinc-200">{formatCurrency(report.amount)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60">
            <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
            <div>
              <span className="text-zinc-500 block">Analyzed At</span>
              <span className="text-zinc-300">{formatDate(report.created_at)}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200 dark:border-zinc-800/60">
            <Bot className="h-4 w-4 text-indigo-400 shrink-0" />
            <div>
              <span className="text-zinc-500 block">Engine Architecture</span>
              <span className="text-zinc-300">Rules + AI Safety Net</span>
            </div>
          </div>
        </div>

        {/* Content / Memo */}
        <div className="space-y-1.5 text-xs">
          <span className="font-semibold text-zinc-400">Invoice Note / Memo Text:</span>
          <div className="p-3.5 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 font-mono text-zinc-300 whitespace-pre-wrap leading-relaxed text-[11px] max-h-40 overflow-y-auto">
            {report.content}
          </div>
        </div>

        {/* Why Flagged Panel (Reasons & Safe Steps) */}
        <WhyFlaggedPanel reasons={report.reasons} />

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <Button variant="outline" size="sm" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>

          {onFeedback && (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onFeedback("MARK_SAFE")}
                className="w-full sm:w-auto text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/20"
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                Mark as Safe
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onFeedback("REPORT_SCAM")}
                className="w-full sm:w-auto"
              >
                <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                Report Scam
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
