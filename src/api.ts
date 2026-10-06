export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch("/api" + url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Не удалось выполнить запрос");
  return body as T;
}
export const money = (minor: number) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(minor / 100);
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(
    new Date(date + "T12:00:00"),
  );
