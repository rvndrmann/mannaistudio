import { IntegrationsPanel } from "@/components/studio/IntegrationsPanel";

export const metadata = { title: "Integrations · AI Director Hub" };

export default function IntegrationsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <h1 className="t-display text-zinc-100">Integrations</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Connect your own model-provider keys, or keep using studio credits.
      </p>
      <div className="mt-8">
        <IntegrationsPanel />
      </div>
    </main>
  );
}
