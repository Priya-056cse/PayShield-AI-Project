import Link from "next/link";
import { Shield, ArrowLeft, Bell, Sliders, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Top Navigation for Dashboard */}
      <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                <Shield className="h-5 w-5" />
              </div>
              <span className="font-bold text-base tracking-tight text-white">
                PayShield<span className="text-blue-500">.AI</span>
              </span>
            </Link>

            <span className="text-zinc-600 hidden sm:inline">/</span>

            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700 hidden sm:inline">
              Agent Console
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Auto-Quarantine: <strong>Enabled (&gt;75)</strong></span>
            </div>

            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-zinc-400 hover:text-white">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Landing Page</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Dashboard Minimal Footer */}
      <footer className="border-t border-zinc-800/80 py-6 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>PayShield AI • Foundation Security Engine</p>
          <p className="text-zinc-600">Zero-credential storage • PayPal Webhook integration ready</p>
        </div>
      </footer>
    </div>
  );
}
