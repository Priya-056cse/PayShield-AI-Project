import Link from "next/link";
import {
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Lock,
  PhoneCall,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-12 pb-20 sm:pt-16 sm:pb-28">
      {/* Background Glow Gradients */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-blue-500/15 via-indigo-500/10 to-transparent blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-10 right-10 w-72 h-72 bg-emerald-500/10 blur-3xl pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Heading, Tagline, Problem/Solution & CTA */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            {/* Live Status Pill */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/80 text-blue-700 dark:text-blue-300 text-xs font-medium shadow-sm">
              <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-ping" />
              <span>Next-Gen Scam Defense Agent</span>
              <span className="text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-zinc-700 dark:text-zinc-300">PayPal Security</span>
            </div>

            {/* Title & Tagline */}
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 leading-[1.1]">
                PayShield <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500">AI</span>
              </h1>
              <p className="text-xl sm:text-2xl font-semibold text-zinc-700 dark:text-zinc-200">
                Your Personal PayPal Scam Defense Agent
              </p>
            </div>

            {/* Problem & Solution Explanation */}
            <p className="text-base sm:text-lg text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Scammers exploit official PayPal invoices to bypass email filters, inserting fake toll-free callback numbers and urgent billing threats into transaction notes.
              <span className="block mt-2 text-zinc-900 dark:text-zinc-100 font-medium">
                PayShield AI intercepts every incoming invoice and payment request in real-time, calculates an explainable AI risk score, and automatically quarantines high-risk fraud before money moves.
              </span>
            </p>

            {/* Call to Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
              <Link href="/dashboard">
                <Button variant="primary" size="lg" className="w-full sm:w-auto shadow-lg shadow-blue-500/25 gap-2">
                  <span>Open Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="#how-it-works">
                <Button variant="outline" size="lg" className="w-full sm:w-auto">
                  View Threat Pipeline
                </Button>
              </Link>
            </div>

            {/* Trust and Key Capabilities Badges */}
            <div className="grid grid-cols-3 gap-4 pt-6 border-t border-zinc-200/80 dark:border-zinc-800/80 text-left">
              <div>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">0.4s</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">Analysis Latency</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">100%</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">Zero Secret Leakage</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">Instant</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">Auto-Quarantine</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Real-Time Interception Visual Preview */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto max-w-md rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 p-6 shadow-2xl backdrop-blur-xl">
              {/* Header simulation */}
              <div className="flex items-center justify-between pb-4 border-b border-zinc-200/80 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-500" />
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-[11px] font-mono text-zinc-400 ml-2">agent_interceptor.log</span>
                </div>
                <Badge variant="danger" size="sm" className="gap-1 animate-pulse">
                  <ShieldAlert className="h-3 w-3" /> THREAT QUARANTINED
                </Badge>
              </div>

              {/* Intercepted Item Card */}
              <div className="mt-4 space-y-4">
                <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />
                      Deceptive PayPal Invoice Intercepted
                    </span>
                    <span className="font-mono text-red-700 dark:text-red-300 font-bold">$599.99 USD</span>
                  </div>
                  <p className="text-xs text-zinc-700 dark:text-zinc-300 font-mono bg-white/70 dark:bg-black/30 p-2 rounded border border-red-200/60 dark:border-red-900/30">
                    &quot;Your Geek Squad protection auto-renewed. To cancel, call helpline +1-800-555-0199&quot;
                  </p>
                </div>

                {/* AI Reasoning Breakdown */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      PayShield AI Risk Assessment
                    </span>
                    <span className="text-xs font-bold font-mono text-rose-600 dark:text-rose-400">
                      Score: 96 / 100 (CRITICAL)
                    </span>
                  </div>

                  {/* Progress meter */}
                  <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-red-600 w-[96%]" />
                  </div>

                  <ul className="space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                    <li className="flex items-start gap-2">
                      <PhoneCall className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                      <span>Extracted fraudulent telephone callback trigger</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Lock className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                      <span>Sender address mismatch: unverified public domain</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      <span>Action: Automatic invoice hold &amp; quarantine applied</span>
                    </li>
                  </ul>
                </div>

                {/* Visual Action Button Simulation */}
                <div className="pt-2 flex gap-2">
                  <Button variant="destructive" size="sm" className="w-full text-xs">
                    Cancel &amp; Dispute in PayPal
                  </Button>
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Inspect Trace
                  </Button>
                </div>
              </div>

              {/* Status footer inside visual */}
              <div className="mt-4 pt-3 border-t border-zinc-200/80 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center gap-1 font-mono">
                  <Terminal className="h-3 w-3 text-blue-500" /> listener: webhook.invoice.received
                </span>
                <span>Protected</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
