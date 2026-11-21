import "server-only";
import ExcelJS from "exceljs";
import { CSV_COLUMNS, ROW_CONDITION, ROW_GLOBAL, ROW_PARAM, ROW_RECIPE, type CsvExportData } from "@/lib/recipe-csv";
import { OPERATORS, SOURCE_FIXED } from "@/lib/recipe-rules";

// ====================================================
// FILE EXCEL (.xlsx) MÃ HÀNG CỦA 1 DỰ ÁN - chỉ chạy trên server
// Cùng các cột với file CSV -> phần đọc / kiểm tra dữ liệu dùng chung (recipe-csv.ts)
//   Sheet "MaHang"   : dữ liệu (có danh sách chọn cho Loai, ThietBi, Kieu, SoSanh, Bat, Nguon)
//   Sheet "HuongDan" : giải thích các cột
// ====================================================

export const DATA_SHEET = "MaHang";
const MAX_ROWS_VALIDATION = 5000; // số dòng có sẵn danh sách chọn

const COLUMN_WIDTHS: Record<string, number> = {
  Loai: 16, MaHang: 18, MoTa: 26, DungDieuKienChung: 12, Bat: 6, ThietBi: 13, DiaChi: 12, Kieu: 9,
  SoSanh: 9, GiaTri: 12, DoDai: 8, GhiChu: 26, Nguon: 13, DiaChiNguon: 13, KieuNguon: 11,
};

/** Giá trị số (không phải chuỗi) ghi thành ô số để Excel không báo "số lưu dạng chữ". */
function asCell(value: string, numeric: boolean): string | number {
  const v = (value ?? "").trim();
  return numeric && /^[-+]?(\d+\.?\d*|\.\d+)$/.test(v) && v.length < 15 ? Number(v) : value ?? "";
}

/** Tạo file Excel (trả về dữ liệu nhị phân). targets: thiết bị của dự án để làm danh sách chọn. */
export async function buildRecipesWorkbook(data: CsvExportData, projectCode: string, targets: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WEB DNC";
  wb.created = new Date();

  // ---------------- Sheet dữ liệu ----------------
  const ws = wb.addWorksheet(DATA_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = CSV_COLUMNS.map((c) => ({ header: c, key: c, width: COLUMN_WIDTHS[c] ?? 12 }));
  // Cột chữ: định dạng Text để Excel không tự đổi (VD: mã hàng 0012 -> 12, địa chỉ 1-5 -> ngày tháng)
  for (const c of ["MaHang", "MoTa", "DiaChi", "GhiChu", "DiaChiNguon"]) ws.getColumn(c).numFmt = "@";

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;

  const add = (values: Record<string, string | number>, kind: string) => {
    const row = ws.addRow(values);
    if (kind === ROW_RECIPE) {
      row.font = { bold: true };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDBEAFE" } };
    } else if (kind === ROW_GLOBAL) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    }
  };

  for (const g of data.globalConditions) {
    add({
      Loai: ROW_GLOBAL, Bat: g.enabled ? 1 : 0, ThietBi: g.target, DiaChi: g.address, Kieu: g.dataType, SoSanh: g.operator,
      GiaTri: asCell(g.value, g.dataType !== "String"), DoDai: g.length, GhiChu: g.note,
    }, ROW_GLOBAL);
  }
  for (const r of data.recipes) {
    add({ Loai: ROW_RECIPE, MaHang: r.mahang, MoTa: r.description, DungDieuKienChung: r.useGlobalConditions ? 1 : 0 }, ROW_RECIPE);
    for (const c of r.conditions) {
      add({
        Loai: ROW_CONDITION, MaHang: r.mahang, Bat: c.enabled ? 1 : 0, ThietBi: c.target, DiaChi: c.address, Kieu: c.dataType,
        SoSanh: c.operator, GiaTri: asCell(c.value, c.dataType !== "String"), DoDai: c.length, GhiChu: c.note,
      }, ROW_CONDITION);
    }
    for (const p of r.params) {
      const fixed = p.source === SOURCE_FIXED;
      add({
        Loai: ROW_PARAM, MaHang: r.mahang, Bat: p.enabled ? 1 : 0, ThietBi: p.target, DiaChi: p.address, Kieu: p.dataType,
        GiaTri: fixed ? asCell(p.value, p.dataType !== "String") : "", DoDai: p.length, GhiChu: p.note,
        Nguon: fixed ? SOURCE_FIXED : p.source, DiaChiNguon: fixed ? "" : p.sourceAddress, KieuNguon: fixed ? "" : p.sourceType,
      }, ROW_PARAM);
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: CSV_COLUMNS.length } };

  // Danh sách chọn (Data Validation) cho các cột mã
  const col = (name: string) => ws.getColumn(name).letter;
  const list = (name: string, items: string[]) => {
    const formula = `"${items.join(",")}"`;
    if (formula.length > 255) return; // giới hạn của Excel
    // exceljs có hàm dataValidations.add (áp cho cả vùng) nhưng file khai báo kiểu chưa có -> ép kiểu
    (ws as unknown as { dataValidations: { add(range: string, v: ExcelJS.DataValidation): void } }).dataValidations.add(
      `${col(name)}2:${col(name)}${MAX_ROWS_VALIDATION}`, {
      type: "list", allowBlank: true, formulae: [formula], showErrorMessage: false,
    });
  };
  list("Loai", [ROW_RECIPE, ROW_CONDITION, ROW_PARAM, ROW_GLOBAL]);
  list("DungDieuKienChung", ["1", "0"]);
  list("Bat", ["1", "0"]);
  list("ThietBi", targets);
  list("Kieu", ["Real", "Bit", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Float", "String"]);
  list("SoSanh", OPERATORS.map((o) => o.code));
  list("Nguon", [SOURCE_FIXED, ...targets]);
  list("KieuNguon", ["Real", "Bit", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Float", "String"]);

  // ---------------- Sheet hướng dẫn ----------------
  const help = wb.addWorksheet("HuongDan");
  help.columns = [{ width: 22 }, { width: 100 }];
  const lines: [string, string][] = [
    [`Mã hàng dự án ${projectCode}`, "Sửa sheet MaHang rồi dùng \"Nhập file\" trên web. Nhập sẽ THAY TOÀN BỘ mã hàng của dự án."],
    ["", ""],
    ["Loai = MAHANG", "1 mã hàng: MaHang, MoTa, DungDieuKienChung (1 = dùng điều kiện chung, 0 = không)"],
    ["Loai = DIEUKIEN", "Điều kiện riêng của mã hàng: MaHang, Bat, ThietBi, DiaChi, Kieu, SoSanh, GiaTri, DoDai, GhiChu"],
    ["Loai = THAMSO", "Tham số gửi xuống máy: như trên (không có SoSanh) + Nguon, DiaChiNguon, KieuNguon"],
    ["Loai = DIEUKIENCHUNG", "Điều kiện chung của dự án (để trống MaHang)"],
    ["", ""],
    ["Thứ tự dòng", "Thứ tự các dòng = thứ tự kiểm tra điều kiện / gửi tham số xuống máy"],
    ["ThietBi", `Thiết bị của dự án: ${targets.join(", ")}`],
    ["DiaChi", "Macro: 500 | PMC: R100, D200, R100.3 (bit) | PLC: D200, M100, X10 (X/Y số hệ 8)"],
    ["Kieu", "Macro: Real | PMC: Bit, Byte, Int16, Int32, Float | PLC: Bit, Int16, UInt16, Int32, UInt32, Float, String"],
    ["SoSanh", "EQ (=), NE (≠), GT (>), GE (≥), LT (<), LE (≤) — Bit và String chỉ dùng EQ / NE"],
    ["Bat", "1 = bật, 0 = tắt (dòng tắt được giữ lại nhưng không dùng)"],
    ["DoDai", "Chỉ dùng cho kiểu String: số word (1 word = 2 ký tự)"],
    ["Nguon", "FIXED = gửi GiaTri cố định; hoặc tên thiết bị để SAO CHÉP giá trị từ DiaChiNguon (kiểu KieuNguon) ngay lúc gửi"],
  ];
  lines.forEach(([a, b], i) => {
    const r = help.addRow([a, b]);
    if (i === 0) r.font = { bold: true, size: 13, color: { argb: "FF1D4ED8" } };
    else r.getCell(1).font = { bold: true };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Đổi giá trị 1 ô Excel thành chữ (số, chữ, đúng/sai, công thức, chữ nhiều định dạng...). */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(15)));
  if (typeof v === "boolean") return v ? "1" : "0";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v && typeof v.text === "string") return v.text;              // ô có liên kết
    if ("result" in v) return cellText((v.result ?? "") as ExcelJS.CellValue); // ô công thức -> lấy kết quả
    if ("error" in v) return "";
  }
  return String(v);
}

/** Đọc file Excel thành bảng chữ (dòng 1 là tiêu đề). Ưu tiên sheet "MaHang", nếu không có thì sheet đầu tiên có cột Loai. */
export async function readWorkbookRows(data: Buffer): Promise<{ ok: true; rows: string[][]; sheet: string } | { ok: false; message: string }> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(data as unknown as ArrayBuffer);
  } catch {
    return { ok: false, message: "Không đọc được file Excel. Hãy lưu file dạng .xlsx (Excel Workbook)." };
  }

  const hasLoai = (ws: ExcelJS.Worksheet) =>
    (ws.getRow(1).values as ExcelJS.CellValue[]).some((v) => cellText(v).trim().toLowerCase() === "loai");
  const ws = wb.getWorksheet(DATA_SHEET) ?? wb.worksheets.find(hasLoai);
  if (!ws) return { ok: false, message: `File không có sheet "${DATA_SHEET}" (hoặc sheet có cột Loai). Hãy dùng file xuất từ trang này làm mẫu.` };

  const width = Math.max(ws.columnCount, CSV_COLUMNS.length);
  const rows: string[][] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: string[] = [];
    for (let c = 1; c <= width; c++) values.push(cellText(row.getCell(c).value));
    rows.push(values);
  }
  return { ok: true, rows, sheet: ws.name };
}