import type { FinanceEntry, FinanceSummary } from "./types";

export function summarizeFinance(entries: FinanceEntry[]): FinanceSummary {
  const totalIncome = entries.filter((e) => e.amount > 0).reduce((sum, e) => sum + e.amount, 0);
  const totalExpense = entries.filter((e) => e.amount < 0).reduce((sum, e) => sum + e.amount, 0);

  const byCategoryMap = new Map<string, number>();
  for (const e of entries) {
    byCategoryMap.set(e.category, (byCategoryMap.get(e.category) ?? 0) + e.amount);
  }

  return {
    totalIncome,
    totalExpense,
    net: totalIncome + totalExpense,
    byCategory: Array.from(byCategoryMap.entries())
      .map(([category, net]) => ({ category, net }))
      .sort((a, b) => b.net - a.net),
  };
}
