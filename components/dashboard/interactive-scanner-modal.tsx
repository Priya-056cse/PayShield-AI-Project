"use client";

import { useState } from "react";
import { X, Play, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RiskBadge } from "./risk-badge";
import { WhyFlaggedPanel } from "./why-flagged-panel";
import { formatCurrency } from "@/lib/utils";
import type { InvoiceAnalysis } from "@/types/invoice";

interface InteractiveScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanComplete?: (result: InvoiceAnalysis) => void;
}

const PRESETS = [
  {
    name: "Geek Squad Fake Renewal (Callback Trap)",
    sender: "geeksquad-billing99@gmail.com",
    amount: "599.99",
    invoiceId: "INV-GS-4910",
    content:
      "INVOICE NOTICE: Your Geek Squad 3-Year Protection Auto-Renewed for $599.99. If unauthorized, call our cancellation helpline immediately at +1-800-555-0199 within 24 hours. Enter your one-time password OTP when prompted.",
  },
  {
    name: "Crypto Escrow Advance-Fee Memo",
    sender: "escrow-validator-node@proton.me",
    amount: "1450.00",
    invoiceId: "",
    content:
      "Pending release of 0.045 BTC to your external wallet. Urgent: Pay handling fee $1,450.00 immediately to unlock escrow release key.",
  },
  {
    name: "Phishing Credential Harvester",
    sender: "security-alert@paypal-resolution-center.xyz",
    amount: "0.00",
    invoiceId: "INV-AUTH-1092",
    content:
      "Security Notice: Unusual activity detected from unauthorized location. Verify your login password and account credentials at https://secure-paypal-resolution-center.xyz/auth immediately to avoid suspension.",
  },
  {
    name: "Standard Retainer Invoice (Legitimate)",
    sender: "billing@trusted-design-studio.com",
    amount: "250.00",
    invoiceId: "INV2-SANDBOX-1001",
    content:
      "Monthly UX consulting and software maintenance retainer for October. Thank you for your partnership.",
  },
];

export function InteractiveScannerModal({
  isOpen,
  onClose,
  onScanComplete,
}: InteractiveScannerModalProps) {
  const [selectedPresetIndex, setSelectedPresetIndex] = useState<number>(0);
  const [sender, setSender] = useState(PRESETS[0].sender);
  const [amount, setAmount] = useState(PRESETS[0].amount);
  const [invoiceId, setInvoiceId] = useState(PRESETS[0].invoiceId);
  const [content, setContent] = useState(PRESETS[0].content);

  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<InvoiceAnalysis | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectPreset = (index: number) => {
    setSelectedPresetIndex(index);
    const p = PRESETS[index];
    setSender(p.sender);
    setAmount(p.amount);
    setInvoiceId(p.invoiceId);
    setContent(p.content);
    setScanResult(null);
    setScanError(null);
  };

  const handleRunScan = async () => {
    setIsScanning(true);
    setScanResult(null);
    setScanError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sender: sender.trim(),
          amount: parseFloat(amount) || 0,
          invoiceId: invoiceId.trim() || null,
          content: content.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setScanError(data.error || "Analysis failed. Please try again.");
        return;
      }

      setScanResult(data);
      if (onScanComplete) {
        onScanComplete(data);
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : "Network error contacting defense agent.");
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-6 sm:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <div>
            <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Interactive Scam Defense Scanner
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Simulate incoming PayPal transactions to inspect deterministic scoring &amp; AI reasoning.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-zinc-400">Choose a Scam Vector Preset:</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(idx)}
                className={`p-3 rounded-lg border text-left transition-colors ${
                  selectedPresetIndex === idx
                    ? "border-blue-500 bg-blue-500/10 text-white"
                    : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/40 text-zinc-300"
                }`}
              >
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-[11px] text-zinc-500 truncate mt-0.5">${p.amount} · {p.sender}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1">
              <label className="text-zinc-400 font-medium">Sender Email Address:</label>
              <input
                type="text"
                value={sender}
                onChange={(e) => setSender(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-zinc-400 font-medium">Amount ($ USD):</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 font-medium">PayPal Invoice ID (optional):</label>
            <input
              type="text"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              placeholder="e.g. INV2-XXXX-XXXX"
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-400 font-medium">Transaction Memo / Note / Email Body:</label>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[11px]"
            />
          </div>
        </div>

        {/* Scan Button */}
        <Button
          variant="primary"
          onClick={handleRunScan}
          disabled={isScanning || !content.trim() || !sender.trim()}
          className="w-full gap-2 shadow-lg shadow-blue-500/20"
        >
          {isScanning ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Analyzing Threat Signals...</span>
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              <span>Run Scam Defense Scan</span>
            </>
          )}
        </Button>

        {/* Error Notification */}
        {scanError && (
          <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-950/20 text-xs text-red-400">
            {scanError}
          </div>
        )}

        {/* Scan Results Display */}
        {scanResult && (
          <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/80 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <RiskBadge level={scanResult.risk_level} />
                <span className="text-xs text-zinc-400">Category: {scanResult.category}</span>
              </div>
              <span className="text-sm font-bold font-mono text-white">
                Score: {scanResult.risk_score} / 100
              </span>
            </div>

            <div className="text-xs space-y-1">
              <span className="text-zinc-400 font-semibold">Recommended Safe Action:</span>
              <p className="text-zinc-200">{scanResult.recommended_action}</p>
            </div>

            <WhyFlaggedPanel reasons={scanResult.reasons} />
          </div>
        )}
      </div>
    </div>
  );
}
