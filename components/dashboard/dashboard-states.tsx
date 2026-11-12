"use client";

import { AlertCircle, FileSearch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 p-5 space-y-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-full" />
        <div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded" />
        <div className="h-3 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded" />
      </div>
      <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full" />
      <div className="flex gap-2 pt-2">
        <div className="h-8 flex-1 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
        <div className="h-8 flex-1 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No reports found",
  description = "No items match your filter criteria or have been recorded yet.",
}: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center space-y-3">
      <FileSearch className="h-10 w-10 text-zinc-400 mx-auto" />
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">{description}</p>
      </div>
    </div>
  );
}

interface ErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorState({ message = "Failed to load reports.", onRetry }: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-950/10 p-8 text-center space-y-3">
      <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-red-400">Connection Error</h4>
        <p className="text-xs text-zinc-400 max-w-sm mx-auto">{message}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry} className="gap-2 text-xs">
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Try Again</span>
      </Button>
    </div>
  );
}
