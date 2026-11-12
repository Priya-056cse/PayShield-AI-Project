"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type FixtureId = "genuine-invoice" | "fraudulent-invoice";
type Classification = "SAFE" | "REVIEW" | "QUARANTINE";

const invoiceDemoResultSchema = z.object({
  fixtureId: z.enum(["genuine-invoice", "fraudulent-invoice"]),
  emailRiskScore: z.number().int().min(0).max(100),
  emailRiskLevel: z.enum(["SAFE", "REVIEW", "QUARANTINE"]),
  emailCategory: z.string(),
  invoiceRiskScore: z.number().int().min(0).max(100),
  paypalVerification: z.object({
    status: z.enum(["MOCK VERIFIED", "MOCK UNVERIFIED"]),
    invoiceId: z.string(),
  }),
  overallRiskScore: z.number().int().min(0).max(100),
  finalClassification: z.enum(["SAFE", "REVIEW", "QUARANTINE"]),
  reasons: z.object({
    email: z.array(z.string()),
    invoice: z.array(z.string()),
    combined: z.array(z.string()),
  }),
  simulated: z.literal(true),
});

type InvoiceDemoResult = z.infer<typeof invoiceDemoResultSchema>;

const classificationStyles: Record<Classification, string> = {
  SAFE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  REVIEW: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  QUARANTINE: "border-red-500/30 bg-red-500/10 text-red-400",
};

function RiskMetric({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
      <p className="text-[11px] font-medium text-zinc-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-zinc-900 dark:text-zinc-100">
        {score}<span className="ml-1 text-xs font-medium text-zinc-500">/100</span>
      </p>
    </div>
  );
}

export function InvoiceFraudDemo() {
  const [result, setResult] = useState<InvoiceDemoResult | null>(null);
  const [loadingFixture, setLoadingFixture] = useState<FixtureId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runFixture(fixtureId: FixtureId) {
    setLoadingFixture(fixtureId);
    setError(null);
    try {
      const response = await fetch("/api/demo/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        const errorResponse = z.object({ error: z.string() }).safeParse(data);
        throw new Error(errorResponse.success ? errorResponse.data.error : "Invoice demo analysis failed.");
      }
      const parsed = invoiceDemoResultSchema.safeParse(data);
      if (!parsed.success) throw new Error("Invoice demo returned an invalid response.");
      setResult(parsed.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Invoice demo analysis failed.");
    } finally {
      setLoadingFixture(null);
    }
  }

  const isQuarantined = result?.finalClassification === "QUARANTINE";
  const ClassificationIcon = isQuarantined ? ShieldAlert : result?.finalClassification === "SAFE" ? ShieldCheck : AlertTriangle;

  return (
    <section aria-labelledby="invoice-demo-title">
      <Card className="overflow-hidden border-blue-500/20">
        <div className="border-b border-zinc-200/70 bg-blue-500/[0.04] p-5 dark:border-zinc-800">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-blue-500 dark:text-blue-400">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-wider">Local-only demo</span>
              </div>
              <h2 id="invoice-demo-title" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                Invoice Fraud Detection Demo
              </h2>
              <p className="max-w-2xl text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                Runs the existing email rules, phishing classifier, and invoice risk engine against saved fixtures.
                PayPal status is mock/simulated; no email, invoice, or payment is created or sent.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="secondary"
                disabled={loadingFixture !== null}
                onClick={() => void runFixture("genuine-invoice")}
                className="w-full whitespace-nowrap text-emerald-500 sm:w-auto"
              >
                {loadingFixture === "genuine-invoice"
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <ShieldCheck className="h-4 w-4" />}
                Test Genuine Invoice
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={loadingFixture !== null}
                onClick={() => void runFixture("fraudulent-invoice")}
                className="w-full whitespace-nowrap sm:w-auto"
              >
                {loadingFixture === "fraudulent-invoice"
                  ? <LoaderCircle className="h-4 w-4 animate-spin" />
                  : <ShieldAlert className="h-4 w-4" />}
                Test Fraudulent Invoice
              </Button>
            </div>
          </div>
        </div>

        <div aria-live="polite" className="p-5">
          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </p>
          )}

          {!result && !error && (
            <p className="text-sm text-zinc-500">
              Select a fixture to see live analysis results. Nothing is sent to external services.
            </p>
          )}

          {result && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <RiskMetric label="Email Risk Score" score={result.emailRiskScore} />
                <RiskMetric label="Invoice Risk Score" score={result.invoiceRiskScore} />
                <RiskMetric label="Overall Risk Score" score={result.overallRiskScore} />
                <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-950/50">
                  <p className="text-[11px] font-medium text-zinc-500">PayPal Verification (MOCK)</p>
                  <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-bold ${
                    result.paypalVerification.status === "MOCK VERIFIED"
                      ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  }`}>
                    {result.paypalVerification.status}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-zinc-500">
                    {result.paypalVerification.invoiceId}
                  </p>
                </div>
              </div>

              <div className={`flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${classificationStyles[result.finalClassification]}`}>
                <div className="flex items-center gap-2">
                  <ClassificationIcon className="h-5 w-5 shrink-0" />
                  <span className="text-sm font-bold">Final Classification: {result.finalClassification}</span>
                </div>
                <span className="text-xs">Email category: {result.emailCategory} · Email level: {result.emailRiskLevel}</span>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Email analysis reasons
                  </h3>
                  <ul className="space-y-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {result.reasons.email.length > 0
                      ? result.reasons.email.map((reason) => <li key={reason} className="flex gap-2"><span className="text-blue-400">•</span><span>{reason}</span></li>)
                      : <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />No email threat indicators detected.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Invoice rule reasons
                  </h3>
                  <ul className="space-y-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {result.reasons.invoice.length > 0
                      ? result.reasons.invoice.map((reason) => <li key={reason} className="flex gap-2"><span className="text-blue-400">•</span><span>{reason}</span></li>)
                      : <li className="flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />No invoice rule indicators detected.</li>}
                  </ul>
                </div>
              </div>
              <p className="text-[11px] text-zinc-500">
                {result.simulated ? "Demo result only; not a live PayPal verification or payment decision." : ""}
              </p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
