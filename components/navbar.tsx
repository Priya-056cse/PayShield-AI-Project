import Link from "next/link";
import { Shield, Sparkles, ArrowRight, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/75 dark:bg-zinc-950/75 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 shadow-md shadow-blue-500/25 transition-transform group-hover:scale-105">
            <Shield className="h-5 w-5 text-white" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg tracking-tight text-zinc-900 dark:text-zinc-50">
                PayShield<span className="text-blue-500">.AI</span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
                <Sparkles className="h-2.5 w-2.5" /> Agent v1
              </span>
            </div>
            <span className="text-[11px] text-zinc-600 dark:text-zinc-300 font-medium hidden sm:block">
              PayPal Scam Defense
            </span>
          </div>
        </Link>

        {/* Center Navigation Links */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          <Link
            href="#problem-solution"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            The Problem
          </Link>
          <Link
            href="#features"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Capabilities
          </Link>
          <Link
            href="#how-it-works"
            className="hover:text-zinc-900 dark:hover:text-white transition-colors"
          >
            Agent Architecture
          </Link>
        </nav>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300">
            <Activity className="h-3 w-3 text-emerald-500 animate-pulse" />
            <span>Shield Engine Armed</span>
          </div>

          <Link href="/dashboard">
            <Button variant="primary" size="sm" className="gap-1.5 group">
              <span>Open Dashboard</span>
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
