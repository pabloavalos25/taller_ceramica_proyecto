export const hasIncome = months => months.some(month => BigInt(month.amountCents) > 0n);
