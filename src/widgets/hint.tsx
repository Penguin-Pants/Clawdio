/** The short hint an empty widget shows instead of a blank area (section 5). */
export function EmptyHint({ children }: { children: string }) {
  return <p className="p-3 text-xs text-text-muted">{children}</p>;
}
