import Link from "next/link";
import { Shield, Lock, FileCode, ExternalLink } from "lucide-react";
import { APP_CONFIG } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-zinc-200/80 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-950/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Column 1: Info */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
                <Shield className="h-4 w-4" />
              </div>
              <span className="font-bold text-base text-zinc-900 dark:text-zinc-50">
                {APP_CONFIG.name}
              </span>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed">
              Autonomous scam defense layer for PayPal accounts. Real-time threat detection, AI risk scoring, and automated quarantine protection for invoices, requests, and suspicious seller communications.
            </p>
            <div className="flex items-center gap-3 text-xs text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Lock className="h-3 w-3 text-emerald-500" /> End-to-End Encrypted
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <FileCode className="h-3 w-3 text-blue-500" /> Next.js 14 App Router
              </span>
            </div>
          </div>

          {/* Column 2: Navigation */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200 mb-3">
              Navigation
            </h4>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li>
                <Link href="/" className="hover:text-blue-500 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-blue-500 transition-colors">
                  Agent Dashboard
                </Link>
              </li>
              <li>
                <Link href="#features" className="hover:text-blue-500 transition-colors">
                  Threat Interception
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="hover:text-blue-500 transition-colors">
                  AI Pipeline
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Architecture & Security */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-zinc-200 mb-3">
              Integration
            </h4>
            <ul className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <li className="flex items-center gap-1 text-zinc-500">
                <span>PayPal Webhook Listener</span>
              </li>
              <li className="flex items-center gap-1 text-zinc-500">
                <span>LLM Risk Scoring Engine</span>
              </li>
              <li className="flex items-center gap-1 text-zinc-500">
                <span>Automatic Invoice Quarantine</span>
              </li>
              <li className="pt-2">
                <Link
                  href="https://developer.paypal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline"
                >
                  <span>PayPal Developer Portal</span>
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} PayShield AI. Designed for intelligent consumer & business payment defense.</p>
          <p className="text-zinc-600 dark:text-zinc-300">
            Foundation Release • Strict Zero-Credential Storage Mode
          </p>
        </div>
      </div>
    </footer>
  );
}
