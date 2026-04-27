function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function buildExportFilename(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mn = pad(now.getMinutes());
  return `stickut_${yyyy}-${mm}-${dd}_${hh}${mn}.png`;
}
