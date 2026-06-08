import type { CardSize } from "@/app/registry/moduleTypes";

export const DASHBOARD_COLUMNS = 12;

export const CARD_SPAN_MAP: Record<CardSize, { columns: number; rows: number }> = {
  "1x1": { columns: 3, rows: 1 },
  "2x1": { columns: 6, rows: 1 },
  "2x2": { columns: 6, rows: 2 },
};
