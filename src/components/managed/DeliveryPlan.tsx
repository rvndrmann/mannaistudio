import { managedProgress, type ManagedPlan } from "@/lib/managed/progress"
export default function DeliveryPlan({ project }: { project: ManagedPlan }) {
  const progress = managedProgress(project)
  return <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
    <div className="flex flex-wrap justify-between gap-4"><div><h2 className="font-bold">Production plan</h2><p className="mt-1 text-sm text-primary">{progress.stageLabel}</p></div><div className="text-sm"><p className="text-white/50">{progress.completed ? "Delivered" : "Expected delivery"}</p><p className="mt-1 font-medium">{progress.completed ? (progress.completedAt ? new Date(progress.completedAt).toLocaleString() : "Completed") : (progress.expectedDeliveryAt ? new Date(progress.expectedDeliveryAt).toLocaleString() : "The team will confirm")}</p>{progress.overdue && <p className="mt-1 text-amber-200">The planned date has passed. Please ask the team for an update.</p>}</div></div>
    <p className="whitespace-pre-wrap text-sm text-white/70">{progress.currentWork}</p>
    {progress.remainingTasks.length > 0 && <div><h3 className="text-xs font-semibold text-white/50">{progress.remainingTasksSource === "team" ? "What's left" : "Next production steps"}</h3><ul className="mt-2 space-y-1 text-sm text-white/70">{progress.remainingTasks.map((task, index) => <li key={index}>• {task}</li>)}</ul></div>}
    {progress.completed && <p className="text-sm text-primary">Your approved final files are available below and through your connected assistant.</p>}
  </section>
}
