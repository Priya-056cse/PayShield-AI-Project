import {
  AlertOctagon,
  ShieldCheck,
  PhoneForwarded,
  Coins,
  FileWarning,
  CheckCircle2,
  Lock,
  Cpu,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ProblemSolution() {
  return (
    <section id="problem-solution" className="py-20 bg-zinc-50/60 dark:bg-zinc-950/40 border-y border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-semibold border border-amber-500/20">
            <AlertOctagon className="h-3.5 w-3.5" /> The Invoice Scam Epidemic
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Why Standard Spam Filters Fail Against PayPal Scams
          </h2>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Modern scammers no longer send easily blocked phishing emails. Instead, they exploit legitimate PayPal notification emails to send weaponized invoices directly to your inbox.
          </p>
        </div>

        {/* Side-by-side Problem vs. Solution comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Problem Card */}
          <Card className="border-red-500/20 dark:border-red-900/30 bg-gradient-to-b from-red-50/30 to-transparent dark:from-red-950/10 dark:to-transparent">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 flex items-center justify-center text-red-600 dark:text-red-400">
                  <AlertOctagon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">The Problem</h3>
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">Official Emails Weaponized</p>
                </div>
              </div>

              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                Because invoices are generated inside PayPal, the notification email originates from genuine <code className="text-xs font-mono bg-zinc-200 dark:bg-zinc-800 px-1 py-0.5 rounded">service@paypal.com</code> servers with perfect DKIM and SPF authentication. Spam filters let it pass untouched.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <PhoneForwarded className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Toll-Free Helpline Traps</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Invoices claim your account was charged $599 for GeekSquad, Norton, or Bitcoin. Panicked users call the fake customer service number printed in the memo note and fall victim to remote access scams.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <Coins className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Advance-Fee &amp; Fictitious Escrow</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Fraudsters send unsolicited payment requests claiming high-value crypto transfers or lottery prizes are awaiting clearance fees.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <FileWarning className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Accidental One-Click Authorization</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      A tired user or family member sees an invoice and accidentally clicks &quot;Pay Now&quot; thinking it is a legitimate household subscription renewal.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Solution Card */}
          <Card className="border-emerald-500/20 dark:border-emerald-900/30 bg-gradient-to-b from-emerald-50/30 to-transparent dark:from-emerald-950/10 dark:to-transparent">
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">The Solution</h3>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">PayShield AI Autonomous Guard</p>
                </div>
              </div>

              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                PayShield AI sits as an intelligent defense agent between your PayPal account and incoming requests. Rather than relying on email headers, it deeply analyzes the contextual semantic meaning of every invoice note and transaction parameter.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <Cpu className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Cognitive Note &amp; Memo Extraction</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Parses invoice line items and seller notes for urgency triggers, toll-free callback numbers, credential harvesting URLs, and impersonated brands.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Explainable 0–100 Risk Score</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      Provides clear, human-readable explanations behind every risk calculation so you know exactly why an item was flagged or cleared.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-200/80 dark:border-zinc-800">
                  <Lock className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">Automated Quarantine &amp; Safeguard</p>
                    <p className="text-zinc-600 dark:text-zinc-300">
                      When a high-risk invoice is detected, PayShield automatically quarantines the invoice, flags it for dispute or cancellation, preventing accidental payments.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
