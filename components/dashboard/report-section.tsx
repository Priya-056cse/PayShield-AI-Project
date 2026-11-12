"use client";

import { ReportCard } from "./report-card";
import { EmptyState } from "./dashboard-states";
import type { RiskReport } from "@/types/invoice";

interface ReportSectionProps {
  title: string;
  count: number;
  reports: RiskReport[];
  icon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onViewDetails: (report: RiskReport) => void;
  onFeedback: (reportId: string, action: "MARK_SAFE" | "REPORT_SCAM") => Promise<void>;
}

export function ReportSection({
  title,
  count,
  reports,
  icon,
  emptyTitle,
  emptyDescription,
  onViewDetails,
  onFeedback,
}: ReportSectionProps) {
  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
            {count}
          </span>
        </div>
      </div>

      {/* Grid or Empty State */}
      {reports.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              onViewDetails={onViewDetails}
              onFeedback={onFeedback}
            />
          ))}
        </div>
      )}
    </section>
  );
}
