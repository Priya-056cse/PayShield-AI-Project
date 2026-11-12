"use client";

import Link from "next/link";
import { Shield, Sparkles, RefreshCw, Terminal, ExternalLink, ArrowLeft, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DashboardHeaderProps {
  onOpenScanner?: () => void;
}

export function DashboardHeader({ onOpenScanner }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-zinc-200/80 dark:border-zinc-800">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors mr-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
          </Link>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            LIVE DEFENSE ACTIVE
          </span>
          <span className="text-xs text-zinc-400 font-mono">
            PayPal Sandbox
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Scam Defense Dashboard
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
          Continuous AI supervision over PayPal invoice webhooks, payment requests, and communication memos.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="primary"
          size="sm"
          className="gap-1.5 text-xs shadow-md shadow-blue-500/20"
          onClick={onOpenScanner}
        >
          <PlusCircle className="h-3.5 w-3.5" /> Test AI Scam Scanner
        </Button>
        <Link
          href="https://developer.paypal.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary" size="sm" className="gap-1.5 text-xs">
            <span>PayPal Console</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
