const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CAD: "CA$",
  AUD: "A$",
};

export function formatTourDisplayPrice(amount: number | null, currency: string | null): string {
  if (amount === null || !Number.isFinite(amount)) return "";

  const normalizedCurrency = currency?.trim().toUpperCase() || "";
  const decimals = Number.isInteger(amount) ? 0 : 2;
  const value = amount.toFixed(decimals);
  const symbol = normalizedCurrency ? CURRENCY_SYMBOLS[normalizedCurrency] : "";

  if (symbol) return `From ${symbol}${value}`;
  if (normalizedCurrency) return `From ${value} ${normalizedCurrency}`;
  return `From ${value}`;
}
