// Which every-snowfall plans a storm triggers. Pure, unit-tested.
export type PlanForStorm = { id: string; triggerCm: number | null; planPausedAt: Date | null; closedAt: Date | null };

export function plansTriggered<T extends PlanForStorm>(plans: T[], cm: number, defaultTriggerCm: number): T[] {
  return plans.filter((p) => !p.closedAt && !p.planPausedAt && cm >= (p.triggerCm ?? defaultTriggerCm));
}
