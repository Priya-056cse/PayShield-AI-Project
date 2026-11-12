"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Globe,
  Mail,
  Phone,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SecurityEvent {
  id: string;
  event_type: "EMAIL" | "URL" | "CALL";
  source: string;
  risk_score: number;
  category: string;
  action: string;
  summary: string;
  reasons: string[];
  urls: string[];
  sender: string | null;
  created_at: string;
}

interface ActivityData {
  metrics: {
    emailsAnalyzed: number;
    threatsDetected: number;
    emailsQuarantined: number;
    otpAttemptsDetected: number;
    callsAnalyzed: number;
    maliciousUrlsDetected: number;
    paypalInvoicesVerified: number;
  };
  events: SecurityEvent[];
  auditLogs: Array<{
    id: string;
    security_event_id: string;
    event_type: string;
    action: string;
    details: string;
    created_at: string;
  }>;
  gmail: {
    connected: boolean;
    email?: string;
    schedulerConfigured: boolean;
    note: string;
  };
}

interface UrlResult {
  riskScore: number;
  riskLevel: string;
  category: string;
  reasons: string[];
  normalizedUrl: string;
  flaggedInPayShield: boolean;
  browserBlocked: boolean;
}

interface CallResult {
  riskScore: number;
  riskLevel: string;
  category: string;
  reasons: string[];
  recommendedAction: string;
  simulated: boolean;
  blocked: boolean;
}

function Metric({
  label,
  value,
  icon,
  tone = "text-blue-400",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</div>
    </Card>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function SecurityConsole() {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [urlResult, setUrlResult] = useState<UrlResult | null>(null);
  const [callDescription, setCallDescription] = useState(
    "Caller claims to be PayPal support, asks me to read out my OTP immediately to authorize a refund."
  );
  const [callResult, setCallResult] = useState<CallResult | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/security/activity", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load persisted security activity.");
      setData((await response.json()) as ActivityData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Security activity is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function scanUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("url");
    setUrlResult(null);
    try {
      const response = await fetch("/api/security/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "URL check failed.");
      setUrlResult(result as UrlResult);
      await refresh();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "URL check failed.");
    } finally {
      setWorking(null);
    }
  }

  async function analyzeCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("call");
    setCallResult(null);
    try {
      const response = await fetch("/api/security/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: callDescription, simulated: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Call analysis failed.");
      setCallResult(result as CallResult);
      await refresh();
    } catch (callError) {
      setError(callError instanceof Error ? callError.message : "Call analysis failed.");
    } finally {
      setWorking(null);
    }
  }

  async function restoreEmail(eventId: string) {
    setWorking(eventId);
    try {
      const response = await fetch(`/api/security/events/${eventId}/restore`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Restore failed.");
      await refresh();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Restore failed.");
    } finally {
      setWorking(null);
    }
  }

  const metrics = data?.metrics;

  return (
    <div className="space-y-6">
      <section aria-labelledby="security-overview-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="security-overview-title" className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Security Overview
            </h2>
            <p className="text-xs text-zinc-500">Counts are read from the local SQLite database.</p>
          </div>
          <p className="text-xs text-zinc-500">
            {loading ? "Loading" : data?.gmail.connected ? `Gmail: ${data.gmail.email}` : "Gmail not connected"}
          </p>
        </div>
        {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <Metric label="Emails analyzed" value={metrics?.emailsAnalyzed ?? 0} icon={<Mail size={15} />} />
          <Metric label="Threats detected" value={metrics?.threatsDetected ?? 0} icon={<ShieldAlert size={15} />} tone="text-rose-400" />
          <Metric label="Emails quarantined" value={metrics?.emailsQuarantined ?? 0} icon={<ShieldCheck size={15} />} tone="text-amber-400" />
          <Metric label="OTP phishing" value={metrics?.otpAttemptsDetected ?? 0} icon={<AlertTriangle size={15} />} tone="text-amber-400" />
          <Metric label="Calls analyzed" value={metrics?.callsAnalyzed ?? 0} icon={<Phone size={15} />} />
          <Metric label="Malicious URLs" value={metrics?.maliciousUrlsDetected ?? 0} icon={<Globe size={15} />} tone="text-rose-400" />
          <Metric label="PayPal invoices verified" value={metrics?.paypalInvoicesVerified ?? 0} icon={<Activity size={15} />} tone="text-emerald-400" />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Email & OTP Protection</h3>
          <p className="mt-2 text-sm text-zinc-500">
            {data?.gmail.note || "Loading Gmail monitor status."}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            {data?.gmail.schedulerConfigured
              ? "Cron secret is configured; confirm an external scheduler is actually calling the endpoint."
              : "Automatic checks require a private scheduler calling /api/cron/gmail with PAYSHIELD_CRON_SECRET."}
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            OTP values are redacted before persistence or AI analysis. Legitimate one-time codes alone are not quarantined.
          </p>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Fake Call Protection · Demo</h3>
          <form onSubmit={analyzeCall} className="mt-3 space-y-3">
            <label htmlFor="call-description" className="sr-only">Simulated call description</label>
            <textarea
              id="call-description"
              value={callDescription}
              onChange={(event) => setCallDescription(event.target.value)}
              maxLength={3000}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 bg-transparent p-3 text-sm dark:border-zinc-700"
            />
            <Button type="submit" size="sm" disabled={working !== null}>
              {working === "call" ? "Analyzing..." : "Analyze simulated call"}
            </Button>
          </form>
          {callResult && (
            <div className="mt-3 rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
              <p className="font-semibold">{callResult.category} · Risk {callResult.riskScore}/100 · {callResult.riskLevel}</p>
              <p className="mt-1">{callResult.recommendedAction}</p>
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                Simulated only — blocked: {callResult.blocked ? "yes" : "no"}.
              </p>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Website & URL Protection · Offline</h3>
          <p className="mt-1 text-xs text-zinc-500">Checks URL structure only; PayShield does not visit the URL or install browser-level blocking.</p>
          <form onSubmit={scanUrl} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label htmlFor="url-input" className="sr-only">URL to check</label>
            <input
              id="url-input"
              type="url"
              required
              maxLength={2048}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/login"
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            />
            <Button type="submit" size="sm" disabled={working !== null}>
              {working === "url" ? "Checking..." : "Check URL"}
            </Button>
          </form>
          {urlResult && (
            <div className="mt-3 rounded-lg bg-zinc-100 p-3 text-xs dark:bg-zinc-800">
              <p className="font-semibold">{urlResult.category} · Risk {urlResult.riskScore}/100 · {urlResult.riskLevel}</p>
              <p className="mt-1 break-all">{urlResult.normalizedUrl}</p>
              <p className="mt-1 text-amber-600 dark:text-amber-400">
                PayShield flagged: {urlResult.flaggedInPayShield ? "yes" : "no"} · Browser blocked: no; links are shown as plain text.
              </p>
              <ul className="mt-1 list-inside list-disc">{urlResult.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">PayPal Invoice Protection</h3>
          <p className="mt-2 text-sm text-zinc-500">
            Existing PayPal Agent Toolkit invoice verification and invoice dashboard are retained. The API is sandbox-only and optional credentials are required for live sandbox lookups.
          </p>
          <p className="mt-2 text-xs text-zinc-500">
            No invoice creation, sending, payment, cancellation, or deletion is performed by security scans.
          </p>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">AI Agent Activity & Quarantine Center</h3>
          <div className="mt-3 space-y-3">
            {(data?.events || []).length === 0 && <p className="text-sm text-zinc-500">No security events recorded yet.</p>}
            {(data?.events || []).map((item) => {
              const restorable = item.event_type === "EMAIL"
                && item.source === "GMAIL"
                && ["QUARANTINED", "REVIEW", "LABEL_ERROR"].includes(item.action);
              return (
                <div key={item.id} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{item.event_type} · {item.category} · {item.risk_score}/100</p>
                    <span className="text-[11px] text-zinc-500">{item.action}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{item.summary}</p>
                  {item.sender && <p className="mt-1 text-xs text-zinc-500">Sender: {item.sender}</p>}
                  {item.urls.map((itemUrl) => <p key={itemUrl} className="mt-1 break-all text-xs text-amber-600">{itemUrl}</p>)}
                  {item.reasons.length > 0 && <p className="mt-1 text-xs">{item.reasons.join(" · ")}</p>}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <time className="text-[11px] text-zinc-500">{formatTime(item.created_at)}</time>
                    {restorable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={working !== null}
                        onClick={() => void restoreEmail(item.id)}
                        className="h-7 gap-1 text-xs"
                      >
                        <RotateCcw size={13} />
                        {working === item.id ? "Restoring..." : "Restore Gmail labels"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Security Audit Logs & Threat Intelligence</h3>
          <p className="mt-1 text-xs text-zinc-500">
            URL indicators are stored locally. No domain reputation provider or browser extension is configured.
          </p>
          <div className="mt-3 space-y-2">
            {(data?.auditLogs || []).length === 0 && <p className="text-sm text-zinc-500">No audit entries recorded yet.</p>}
            {(data?.auditLogs || []).map((log) => (
              <div key={log.id} className="border-b border-zinc-200 pb-2 text-xs dark:border-zinc-800">
                <p className="font-medium">{log.action} · {log.event_type}</p>
                <p className="text-zinc-500">{log.details}</p>
                <time className="text-[11px] text-zinc-500">{formatTime(log.created_at)}</time>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
