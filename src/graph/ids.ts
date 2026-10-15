/** Next system-issued id: `${prefix}_${N}`, N = 1 + max numeric suffix among matching ids. */
export function nextId(prefix: string, existingIds: Iterable<string>): string {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${escaped}_(\\d+)$`);
  let max = 0;
  for (const id of existingIds) {
    const m = re.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}_${max + 1}`;
}
