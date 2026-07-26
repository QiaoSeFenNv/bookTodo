import type { TemplateMode } from "./api";

export type SpreadId = "today" | "inbox" | "schedule" | "outline";

export function buildSpreadOrder(template: TemplateMode): SpreadId[] {
  if (template === "A") return ["today", "inbox"];
  if (template === "B") return ["schedule"];
  return ["outline", "schedule"];
}

export function spreadLabel(id: SpreadId): string {
  switch (id) {
    case "today":
      return "今日";
    case "inbox":
      return "清单";
    case "schedule":
      return "日程";
    case "outline":
      return "大纲";
    default:
      return id;
  }
}

export function defaultSpread(template: TemplateMode, last?: string | null): SpreadId {
  const order = buildSpreadOrder(template);
  if (last && order.includes(last as SpreadId)) {
    return last as SpreadId;
  }
  return order[0];
}

export function bookThicknessPx(doneCount: number): number {
  return Math.min(56, Math.max(8, 8 + doneCount * 2.2));
}
