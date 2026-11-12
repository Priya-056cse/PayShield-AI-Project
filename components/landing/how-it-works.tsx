import { ArrowRight, ShieldCheck, Cpu, Radio, AlertOctagon } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      step: "01",
      icon: <Radio className="h-6 w-6 text-blue-500" />,
      title: "Real-Time Ingestion",
      description:
        "The moment an invoice, money request, or note arrives on your PayPal account, PayShield receives a secure webhook event containing the full payload.",
      detail: "Captures invoice lines, memo text, sender metadata, and requested currencies.",
    },
    {
      step: "02",
      icon: <Cpu className="h-6 w-6 text-indigo-500" />,
      title: "Contextual AI Reasoning",
      description:
        "The defense agent analyzes the language, cross-references known fraud scripts (GeekSquad, Norton, crypto recovery), and extracts suspicious callback numbers or domains.",
      detail: "Generates an explainable risk score (0–100) and an itemized evidence breakdown.",
    },
    {
      step: "03",
      icon: <ShieldCheck className="h-6 w-6 text-emerald-500" />,
      title: "Autonomous Quarantine",
      description:
        "Items with elevated risk are locked in quarantine. You receive an instant alert with clear explanation, allowing you to dispute or cancel with one click.",
      detail: "Prevents accidental payments while trusted recurring bills pass without friction.",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-zinc-50/60 dark:bg-zinc-950/40 border-y border-zinc-200/80 dark:border-zinc-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold border border-emerald-500/20">
            Pipeline Architecture
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            How PayShield AI Protects Your Account
          </h2>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            A continuous three-stage defense pipeline providing frictionless protection for your PayPal transactions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((item, index) => (
            <div
              key={index}
              className="relative flex flex-col p-8 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-sm"
            >
              {/* Step indicator */}
              <div className="flex items-center justify-between mb-6">
                <div className="h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                  {item.icon}
                </div>
                <span className="text-3xl font-extrabold text-zinc-300 dark:text-zinc-700 font-mono">
                  {item.step}
                </span>
              </div>

              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                {item.title}
              </h3>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 leading-relaxed">
                {item.description}
              </p>
              
              <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800/80 text-xs text-zinc-500 flex items-center gap-1.5">
                <AlertOctagon className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                <span>{item.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
