import {
  ShieldAlert,
  Zap,
  FileSearch,
  Lock,
  Activity,
  PhoneOff,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export function Features() {
  const features = [
    {
      icon: <Zap className="h-5 w-5 text-amber-500" />,
      title: "Real-Time Webhook Interception",
      description:
        "Subscribes directly to PayPal webhook events (INVOICING.INVOICE.CREATED, PAYMENT.CAPTURE.PENDING). Evaluates incoming items in milliseconds before you even open your notification.",
    },
    {
      icon: <PhoneOff className="h-5 w-5 text-red-500" />,
      title: "Callback Number De-obfuscation",
      description:
        "Specifically engineered to detect spaced, spelled-out, or hidden telephone numbers embedded within invoice memos designed to bait victims into call-center extortion scams.",
    },
    {
      icon: <FileSearch className="h-5 w-5 text-blue-500" />,
      title: "Explainable AI Risk Scoring",
      description:
        "Assigns a definitive 0–100 threat score alongside itemized risk factors and evidence citations. No black-box decisions—understand exactly why an invoice was flagged.",
    },
    {
      icon: <ShieldAlert className="h-5 w-5 text-purple-500" />,
      title: "Instant Threat Quarantine",
      description:
        "High-risk items exceeding the security threshold are instantly moved into quarantine, preventing accidental approvals or unauthorized wallet debits.",
    },
    {
      icon: <Activity className="h-5 w-5 text-emerald-500" />,
      title: "Historical Baseline Profiling",
      description:
        "Learns your recurring authentic merchants (e.g., GitHub, Adobe, AWS) so normal subscriptions pass smoothly without false positive interruptions.",
    },
    {
      icon: <Lock className="h-5 w-5 text-cyan-500" />,
      title: "Strict Zero-Credential Architecture",
      description:
        "Built with enterprise privacy standards. PayShield never stores PayPal passwords or financial secrets. All operations run through standard OAuth2 environment variables.",
    },
  ];

  return (
    <section id="features" className="py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold border border-blue-500/20">
            Security Capabilities
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Engineered for Precision Scam Interception
          </h2>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            Comprehensive defense mechanisms tailored to the specific tactics used by modern payment fraudsters.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => (
            <Card
              key={idx}
              className="border-zinc-200/80 dark:border-zinc-800 hover:border-blue-500/40 dark:hover:border-blue-500/40 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <CardHeader className="space-y-3">
                <div className="h-10 w-10 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {feature.icon}
                </div>
                <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {feature.title}
                </CardTitle>
                <CardDescription className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {feature.description}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
