import "server-only";
import ExcelJS from "exceljs";

// ====================================================
// TẠO FILE EXCEL DÙNG CHUNG (sheet dữ liệu + sheet hướng dẫn)
// Tiêu đề cố định khi cuộn, bộ lọc, cột chữ định dạng Text, danh sách chọn, tô màu dòng
// ====================================================

export type SheetSpec = {
  sheetName: string;
  columns: { key: string; width: number }[];
  rows: Record<string, string | number>[];
  textColumns: string[];                                   // định dạng Text: Excel không tự đổi 0012 -> 12
  numericColumns?: string[];                               // ô số thật khi giá trị là số
  validations?: { column: string; items: string[] }[];     // danh sách chọn
  rowStyle?: (row: Record<string, string | number>) => { fill?: string; bold?: boolean } | undefined;
  help?: { title: string; lines: [string, string][] };
};

const MAX_ROWS_VALIDATION = 5000;

export async function buildWorkbook(spec: SheetSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WEB DNC";
  wb.created = new Date();

  const ws = wb.addWorksheet(spec.sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = spec.columns.map((c) => ({ header: c.key, key: c.key, width: c.width }));
  for (const c of spec.textColumns) ws.getColumn(c).numFmt = "@";

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  header.height = 22;

  const numeric = new Set(spec.numericColumns ?? []);
  for (const values of spec.rows) {
    const row = ws.addRow(Object.fromEntries(Object.entries(values).map(([k, v]) => {
      const s = typeof v === "string" ? v.trim() : v;
      return [k, numeric.has(k) && typeof s === "string" && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(s) && s.length < 15 ? Number(s) : v];
    })));
    const style = spec.rowStyle?.(values);
    if (style?.bold) row.font = { bold: true };
    if (style?.fill) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: style.fill } };
  }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };

  for (const v of spec.validations ?? []) {
    const formula = `"${v.items.join(",")}"`;
    if (formula.length > 255) continue; // giới hạn của Excel
    const letter = ws.getColumn(v.column).letter;
    // exceljs có dataValidations.add nhưng file khai báo kiểu chưa có -> ép kiểu
    (ws as unknown as { dataValidations: { add(range: string, val: ExcelJS.DataValidation): void } }).dataValidations.add(
      `${letter}2:${letter}${MAX_ROWS_VALIDATION}`, { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: false });
  }

  if (spec.help) {
    const help = wb.addWorksheet("HuongDan");
    help.columns = [{ width: 22 }, { width: 100 }];
    const t = help.addRow([spec.help.title]);
    t.font = { bold: true, size: 13, color: { argb: "FF1D4ED8" } };
    help.addRow([]);
    for (const [a, b] of spec.help.lines) help.addRow([a, b]).getCell(1).font = { bold: true };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}