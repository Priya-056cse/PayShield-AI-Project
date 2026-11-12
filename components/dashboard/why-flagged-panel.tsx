"use client";

import { AlertOctagon, CheckCircle2, PhoneOff, KeyRound, Globe } from "lucide-react";

interface WhyFlaggedPanelProps {
  reasons: string[];
  className?: string;
}

export function WhyFlaggedPanel({ reasons, className = "" }: WhyFlaggedPanelProps) {
  return (
    <div
      className={`rounded-lg border border-red-500/30 bg-red-950/20 p-4 text-xs space-y-3 ${className}`}
    >
      <div className="flex items-center gap-2 font-bold text-red-400">
        <AlertOctagon className="h-4 w-4 shrink-0 text-red-500" />
        <span>Why was this flagged?</span>
      </div>

      {/* Flagged reasons list */}
      <ul className="space-y-1.5 pl-1 text-zinc-300">
        {reasons.map((reason, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>

      {/* Safe Next Steps */}
      <div className="pt-2 border-t border-red-500/20 space-y-1.5">
        <div className="font-semibold text-zinc-200">Recommended Safe Next Steps:</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-zinc-400">
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-2 rounded border border-zinc-800">
            <Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span>Verify solely via official PayPal website/app.</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-2 rounded border border-zinc-800">
            <PhoneOff className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Never call telephone numbers written in invoices.</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-900/60 p-2 rounded border border-zinc-800">
            <KeyRound className="h-3.5 w-3.5 text-rose-400 shrink-0" />
            <span>Never disclose passwords, OTPs, or card CVVs.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
