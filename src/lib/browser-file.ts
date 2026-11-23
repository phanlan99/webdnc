// ====================================================
// TIỆN ÍCH FILE TRÊN TRÌNH DUYỆT (tải file về, đọc file người dùng chọn)
// ====================================================

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Đọc CSV: ưu tiên UTF-8; nếu Excel lưu kiểu "CSV (Comma delimited)" (bảng mã Windows) thì đọc bằng windows-1258. */
export async function readCsvText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("windows-1258").decode(buf);
  }
}

/** Loại file theo đuôi: xlsx / csv / xls (chưa hỗ trợ) / khác. */
export function fileKind(name: string): "xlsx" | "csv" | "xls" | "other" {
  const n = name.toLowerCase();
  if (n.endsWith(".xlsx")) return "xlsx";
  if (n.endsWith(".csv")) return "csv";
  if (n.endsWith(".xls")) return "xls";
  return "other";
}