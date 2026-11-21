// ====================================================
// FILE CSV MÃ HÀNG CỦA 1 DỰ ÁN (mở / sửa được bằng Excel)
// Dùng chung trình duyệt (xem trước) và server (kiểm tra lại trước khi ghi Database).
//
// Mỗi dòng có cột "Loai":
//   MAHANG        : 1 mã hàng            -> MaHang, MoTa, DungDieuKienChung
//   DIEUKIEN      : điều kiện riêng      -> MaHang, Bat, ThietBi, DiaChi, Kieu, SoSanh, GiaTri, DoDai, GhiChu
//   THAMSO        : tham số gửi xuống máy-> MaHang, Bat, ThietBi, DiaChi, Kieu, GiaTri, DoDai, GhiChu, Nguon, DiaChiNguon, KieuNguon
//   DIEUKIENCHUNG : điều kiện chung      -> Bat, ThietBi, DiaChi, Kieu, SoSanh, GiaTri, DoDai, GhiChu
// Thứ tự các dòng = thứ tự kiểm tra / gửi.
// ThietBi: MACRO, PMC, PLC, PLC:PLC2...  |  SoSanh: EQ NE GT GE LT LE (hoặc = ≠ > ≥ < ≤)
// Nguon  : FIXED (giá trị cố định) hoặc thiết bị nguồn khi sao chép (PLC, PMC, MACRO...)
// ====================================================

import {
  OPERATORS,
  SOURCE_FIXED,
  validateRecipe,
  type ConditionInput,
  type ParamInput,
  type RecipeInput,
} from "@/lib/recipe-rules";

export const CSV_COLUMNS = [
  "Loai", "MaHang", "MoTa", "DungDieuKienChung", "Bat", "ThietBi", "DiaChi", "Kieu",
  "SoSanh", "GiaTri", "DoDai", "GhiChu", "Nguon", "DiaChiNguon", "KieuNguon",
] as const;
type Column = (typeof CSV_COLUMNS)[number];

export const ROW_RECIPE = "MAHANG";
export const ROW_CONDITION = "DIEUKIEN";
export const ROW_PARAM = "THAMSO";
export const ROW_GLOBAL = "DIEUKIENCHUNG";

/** Dữ liệu xuất: giống kiểu đọc từ Database (lib/recipes.ts) nhưng chỉ phần cần thiết. */
export type CsvExportData = {
  globalConditions: ConditionInput[];
  recipes: RecipeInput[];
};

// ---------------------------------------------------------------- GHI CSV
const TEXT_COLUMNS: Column[] = ["MaHang", "MoTa", "GhiChu"];

function cell(value: string, column: Column): string {
  let v = value ?? "";
  // Chống Excel hiểu nhầm thành công thức (VD: ghi chú bắt đầu bằng "=")
  if (TEXT_COLUMNS.includes(column) && /^[=+\-@]/.test(v)) v = "'" + v;
  return /[",\r\n;]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function line(values: Partial<Record<Column, string>>): string {
  return CSV_COLUMNS.map((c) => cell(values[c] ?? "", c)).join(",");
}

/** Tạo nội dung CSV (có BOM để Excel đọc đúng tiếng Việt). */
export function buildRecipesCsv(data: CsvExportData): string {
  const out: string[] = [CSV_COLUMNS.join(",")];
  const cond = (type: string, mahang: string, c: ConditionInput) =>
    line({
      Loai: type, MaHang: mahang, Bat: c.enabled ? "1" : "0", ThietBi: c.target, DiaChi: c.address, Kieu: c.dataType,
      SoSanh: c.operator, GiaTri: c.value, DoDai: String(c.length), GhiChu: c.note,
    });

  for (const g of data.globalConditions) out.push(cond(ROW_GLOBAL, "", g));
  for (const r of data.recipes) {
    out.push(line({ Loai: ROW_RECIPE, MaHang: r.mahang, MoTa: r.description, DungDieuKienChung: r.useGlobalConditions ? "1" : "0" }));
    for (const c of r.conditions) out.push(cond(ROW_CONDITION, r.mahang, c));
    for (const p of r.params) {
      const fixed = p.source === SOURCE_FIXED;
      out.push(line({
        Loai: ROW_PARAM, MaHang: r.mahang, Bat: p.enabled ? "1" : "0", ThietBi: p.target, DiaChi: p.address, Kieu: p.dataType,
        GiaTri: fixed ? p.value : "", DoDai: String(p.length), GhiChu: p.note, Nguon: fixed ? SOURCE_FIXED : p.source,
        DiaChiNguon: fixed ? "" : p.sourceAddress, KieuNguon: fixed ? "" : p.sourceType,
      }));
    }
  }
  return "\uFEFF" + out.join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------- ĐỌC CSV
/** Tách CSV theo chuẩn (hỗ trợ ô có dấu phẩy / xuống dòng / nháy kép). Tự nhận dấu phân cách , ; hoặc Tab. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][0]; // Excel tiếng Việt hay lưu bằng dấu ;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Bỏ dấu tiếng Việt + khoảng trắng để so tên cột / giá trị linh hoạt
function key(s: string): string {
  return (s ?? "").replace(/đ/g, "d").replace(/Đ/g, "D").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-]/g, "").toUpperCase();
}

const ROW_TYPES: Record<string, string> = {
  MAHANG: ROW_RECIPE, RECIPE: ROW_RECIPE,
  DIEUKIEN: ROW_CONDITION, DIEUKIENRIENG: ROW_CONDITION, CONDITION: ROW_CONDITION, COND: ROW_CONDITION,
  THAMSO: ROW_PARAM, PARAM: ROW_PARAM,
  DIEUKIENCHUNG: ROW_GLOBAL, GLOBAL: ROW_GLOBAL,
};

function toTarget(v: string): string {
  const raw = (v ?? "").trim();
  const k = key(raw);
  if (k === "MACRO" || k === "FANUCMACRO") return "MACRO";
  if (k === "PMC" || k === "FANUCPMC") return "PMC";
  if (k === "PLC" || k === "PLCFX5U" || k === "PLC1") return "PLC";
  const m = /^(?:PLC:|PLC FX5U \[)?(PLC\d+)\]?$/i.exec(raw);
  if (m) return m[1].toUpperCase() === "PLC1" ? "PLC" : `PLC:${m[1].toUpperCase()}`;
  return raw.toUpperCase();
}

function toOperator(v: string): string {
  const s = (v ?? "").trim().toUpperCase();
  const map: Record<string, string> = { "=": "EQ", "==": "EQ", "≠": "NE", "!=": "NE", "<>": "NE", ">": "GT", ">=": "GE", "≥": "GE", "<": "LT", "<=": "LE", "≤": "LE" };
  return map[s] ?? (OPERATORS.some((o) => o.code === s) ? s : s || "EQ");
}

function toBool(v: string, def: boolean): boolean {
  const k = key(v);
  if (k === "") return def;
  return ["1", "TRUE", "X", "YES", "Y", "CO", "BAT", "ON"].includes(k);
}

function toType(v: string): string {
  const k = key(v);
  const types = ["Real", "Bit", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Float", "String"];
  return types.find((t) => t.toUpperCase() === k) ?? (v ?? "").trim();
}

/** Số thập phân kiểu Việt Nam "12,5" -> "12.5" (chỉ với kiểu số). */
function toValue(v: string, dataType: string): string {
  const s = v ?? "";
  if (dataType === "String") return s;
  const t = s.trim();
  return /^[-+]?\d+,\d+$/.test(t) ? t.replace(",", ".") : t;
}

function stripApostrophe(v: string): string {
  return (v ?? "").startsWith("'") ? v.slice(1) : v ?? "";
}

export type CsvIssue = { line?: number; message: string };

export type CsvImportResult = {
  recipes: RecipeInput[];
  globalConditions: ConditionInput[];
  issues: CsvIssue[];                // lỗi -> không cho nhập
  stats: { recipes: number; conditions: number; params: number; globals: number };
};

/**
 * Đọc nội dung CSV thành dữ liệu mã hàng + kiểm tra theo quy tắc (allowedTargets: thiết bị của dự án).
 * Không ném lỗi: mọi vấn đề trả về trong "issues".
 */
export function readRecipesCsv(text: string, allowedTargets: string[]): CsvImportResult {
  return readRecipesRows(parseCsv(text), allowedTargets);
}

/**
 * Đọc bảng dữ liệu (dòng 1 là tiêu đề) thành mã hàng + kiểm tra.
 * Dùng chung cho CSV và Excel (file Excel có cùng các cột với CSV).
 */
export function readRecipesRows(rows: string[][], allowedTargets: string[]): CsvImportResult {
  const issues: CsvIssue[] = [];
  const recipes = new Map<string, RecipeInput>(); // khóa: mã hàng viết hoa (Database không phân biệt hoa/thường)
  const globals: ConditionInput[] = [];
  const empty: CsvImportResult = { recipes: [], globalConditions: [], issues, stats: { recipes: 0, conditions: 0, params: 0, globals: 0 } };

  if (rows.length === 0) {
    issues.push({ message: "File trống." });
    return empty;
  }

  // Dòng tiêu đề -> vị trí từng cột (không phân biệt hoa/thường, có dấu hay không)
  const header = rows[0].map(key);
  const pos = {} as Record<Column, number>;
  for (const c of CSV_COLUMNS) pos[c] = header.indexOf(key(c));
  const missing = (["Loai", "MaHang"] as Column[]).filter((c) => pos[c] < 0);
  if (missing.length > 0) {
    issues.push({ line: 1, message: `Thiếu cột ${missing.join(", ")} ở dòng tiêu đề. Hãy dùng file xuất từ trang này làm mẫu.` });
    return empty;
  }
  const get = (r: string[], c: Column) => (pos[c] >= 0 ? (r[pos[c]] ?? "") : "");

  const ensureRecipe = (mahang: string): RecipeInput => {
    const k = mahang.toUpperCase();
    let r = recipes.get(k);
    if (!r) {
      r = { mahang, description: "", useGlobalConditions: true, conditions: [], params: [] };
      recipes.set(k, r);
    }
    return r;
  };
  const declared = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const lineNo = i + 1;
    if (r.every((v) => v.trim() === "")) continue;             // dòng trống
    if (r[0]?.trim().startsWith("#")) continue;                // dòng ghi chú

    const type = ROW_TYPES[key(get(r, "Loai"))];
    if (!type) {
      issues.push({ line: lineNo, message: `Cột Loai "${get(r, "Loai")}" không hợp lệ (MAHANG, DIEUKIEN, THAMSO, DIEUKIENCHUNG).` });
      continue;
    }
    const mahang = stripApostrophe(get(r, "MaHang")).trim();

    const condition = (): ConditionInput => {
      const dataType = toType(get(r, "Kieu"));
      return {
        enabled: toBool(get(r, "Bat"), true), target: toTarget(get(r, "ThietBi")), address: get(r, "DiaChi").trim(),
        dataType, operator: toOperator(get(r, "SoSanh")), value: toValue(get(r, "GiaTri"), dataType),
        length: Number(get(r, "DoDai").trim() || 10), note: stripApostrophe(get(r, "GhiChu")).trim(),
      };
    };

    if (type === ROW_GLOBAL) {
      globals.push(condition());
      continue;
    }
    if (!mahang) {
      issues.push({ line: lineNo, message: "Thiếu MaHang." });
      continue;
    }

    if (type === ROW_RECIPE) {
      if (declared.has(mahang.toUpperCase())) {
        issues.push({ line: lineNo, message: `Mã hàng "${mahang}" bị khai báo 2 lần.` });
        continue;
      }
      declared.add(mahang.toUpperCase());
      const rec = ensureRecipe(mahang);
      rec.mahang = mahang;
      rec.description = stripApostrophe(get(r, "MoTa")).trim();
      rec.useGlobalConditions = toBool(get(r, "DungDieuKienChung"), true);
    } else if (type === ROW_CONDITION) {
      ensureRecipe(mahang).conditions.push(condition());
    } else {
      const dataType = toType(get(r, "Kieu"));
      const sourceRaw = get(r, "Nguon").trim();
      const source = ["", "FIXED", "CODINH", "GIATRICODINH"].includes(key(sourceRaw)) ? SOURCE_FIXED : toTarget(sourceRaw);
      const param: ParamInput = {
        enabled: toBool(get(r, "Bat"), true), target: toTarget(get(r, "ThietBi")), address: get(r, "DiaChi").trim(), dataType,
        value: source === SOURCE_FIXED ? toValue(get(r, "GiaTri"), dataType) : "", length: Number(get(r, "DoDai").trim() || 10),
        note: stripApostrophe(get(r, "GhiChu")).trim(), source,
        sourceAddress: source === SOURCE_FIXED ? "" : get(r, "DiaChiNguon").trim(),
        sourceType: source === SOURCE_FIXED ? "Int16" : toType(get(r, "KieuNguon")),
      };
      ensureRecipe(mahang).params.push(param);
    }
  }

  // Kiểm tra từng mã hàng + điều kiện chung theo đúng quy tắc khi thêm / sửa trên web
  const list = [...recipes.values()];
  for (const rec of list) {
    for (const e of validateRecipe(rec, allowedTargets)) issues.push({ message: `Mã hàng ${rec.mahang || "(trống)"} — ${e.message}` });
  }
  const globalErrors = validateRecipe({ mahang: "_", description: "", useGlobalConditions: true, conditions: globals, params: [] }, allowedTargets);
  for (const e of globalErrors) issues.push({ message: `Điều kiện chung — ${e.message.replace(/^Điều kiện/, "dòng")}` });

  return {
    recipes: list,
    globalConditions: globals,
    issues,
    stats: {
      recipes: list.length,
      conditions: list.reduce((s, r) => s + r.conditions.length, 0),
      params: list.reduce((s, r) => s + r.params.length, 0),
      globals: globals.length,
    },
  };
}