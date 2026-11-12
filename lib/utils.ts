import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RiskLevel, QuarantineStatus } from "@/types";

/**
 * Merge Tailwind classes safely with clsx and twMerge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format currency numbers with localized symbol
 */
export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Return color definitions for a specific risk level
 */
export function getRiskColorClass(level: RiskLevel | string): {
  badge: string;
  border: string;
  text: string;
  bgLight: string;
} {
  switch (level) {
    case "QUARANTINE":
    case "CRITICAL":
      return {
        badge: "bg-red-500/15 text-red-500 border-red-500/30",
        border: "border-red-500/40",
        text: "text-red-500",
        bgLight: "bg-red-500/10",
      };
    case "NEEDS_REVIEW":
    case "HIGH":
      return {
        badge: "bg-amber-500/15 text-amber-500 border-amber-500/30",
        border: "border-amber-500/40",
        text: "text-amber-500",
        bgLight: "bg-amber-500/10",
      };
    case "MEDIUM":
      return {
        badge: "bg-amber-500/15 text-amber-500 border-amber-500/30",
        border: "border-amber-500/40",
        text: "text-amber-500",
        bgLight: "bg-amber-500/10",
      };
    case "SAFE":
    case "LOW":
    default:
      return {
        badge: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
        border: "border-emerald-500/40",
        text: "text-emerald-500",
        bgLight: "bg-emerald-500/10",
      };
  }
}

/**
 * Format quarantine status text for display
 */
export function formatQuarantineStatus(status: QuarantineStatus | string): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "QUARANTINED":
      return {
        label: "Quarantined",
        badgeClass: "bg-purple-500/20 text-purple-400 border-purple-500/30 animate-pulse-slow",
      };
    case "RELEASED":
    case "RELEASED_BY_USER":
      return {
        label: "Approved & Released",
        badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      };
    case "REPORTED_SCAM":
      return {
        label: "Reported Scam",
        badgeClass: "bg-rose-500/20 text-rose-400 border-rose-500/30",
      };
    case "DISPUTED":
      return {
        label: "Disputed in PayPal",
        badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      };
    case "AUTO_CANCELLED":
      return {
        label: "Auto-Cancelled",
        badgeClass: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
      };
    case "NOT_QUARANTINED":
    default:
      return {
        label: "Cleared",
        badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      };
  }
}

/**
 * Format relative or full dates cleanly
 */
export function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  } catch {
    return dateString;
  }
}
