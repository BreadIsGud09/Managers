import * as XLSX from "xlsx";

export type Sheet = { name: string; rows: (string | number)[][] };

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Xuất nhiều sheet ra file .xlsx */
export function exportXlsx(fileBase: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    const widths = (s.rows[0] ?? []).map((_, i) => ({
      wch: Math.min(40, Math.max(10, ...s.rows.map((r) => String(r[i] ?? "").length + 2))),
    }));
    (ws as any)["!cols"] = widths;
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, `${fileBase}-${stamp()}.xlsx`);
}

export function exportCsv(fileBase: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${fileBase}-${stamp()}.csv`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFileName(base: string) {
  return `${base}-${stamp()}`;
}
