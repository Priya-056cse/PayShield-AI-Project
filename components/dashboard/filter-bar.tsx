"use client";

import { useState, useEffect } from "react";
import { Search, X } from "lucide-react";
import type { RiskLevel } from "@/types/invoice";

interface FilterBarProps {
  selectedLevel: "ALL" | RiskLevel;
  onSelectLevel: (level: "ALL" | RiskLevel) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  counts: {
    all: number;
    safe: number;
    needsReview: number;
    quarantine: number;
  };
}

export function FilterBar({
  selectedLevel,
  onSelectLevel,
  searchQuery,
  onSearchChange,
  counts,
}: FilterBarProps) {
  const [localSearch, setLocalSearch] = useState(searchQuery);

  // 300ms debounce for search box
  useEffect(() => {
    const handler = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);

    return () => clearTimeout(handler);
  }, [localSearch, onSearchChange]);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
      {/* Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto text-xs p-1">
        <button
          onClick={() => onSelectLevel("ALL")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
            selectedLevel === "ALL"
              ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300"
          }`}
        >
          All ({counts.all})
        </button>

        <button
          onClick={() => onSelectLevel("QUARANTINE")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
            selectedLevel === "QUARANTINE"
              ? "bg-red-500/15 text-red-400 border border-red-500/30"
              : "text-zinc-500 hover:text-red-400"
          }`}
        >
          Quarantine ({counts.quarantine})
        </button>

        <button
          onClick={() => onSelectLevel("NEEDS_REVIEW")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
            selectedLevel === "NEEDS_REVIEW"
              ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              : "text-zinc-500 hover:text-amber-400"
          }`}
        >
          Needs Review ({counts.needsReview})
        </button>

        <button
          onClick={() => onSelectLevel("SAFE")}
          className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
            selectedLevel === "SAFE"
              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
              : "text-zinc-500 hover:text-emerald-400"
          }`}
        >
          Safe ({counts.safe})
        </button>
      </div>

      {/* Debounced Search Box */}
      <div className="relative min-w-[240px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
        <input
          type="text"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search sender, ID, note..."
          className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {localSearch && (
          <button
            onClick={() => {
              setLocalSearch("");
              onSearchChange("");
            }}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
