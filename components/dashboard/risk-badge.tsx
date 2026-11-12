"use client";

import type { RiskLevel } from "@/types/invoice";
import { ShieldCheck, AlertTriangle, ShieldAlert } from "lucide-react";

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
  showIcon?: boolean;
}

export function RiskBadge({ level, className = "", showIcon = true }: RiskBadgeProps) {
  switch (level) {
    case "SAFE":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 ${className}`}
        >
          {showIcon && <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />}
          <span>SAFE</span>
        </span>
      );

    case "NEEDS_REVIEW":
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25 ${className}`}
        >
          {showIcon && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          <span>NEEDS REVIEW</span>
        </span>
      );

    case "QUARANTINE":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 animate-pulse-slow ${className}`}
        >
          {showIcon && <ShieldAlert className="h-3.5 w-3.5 text-red-500" />}
          <span>QUARANTINE</span>
        </span>
      );
  }
}
