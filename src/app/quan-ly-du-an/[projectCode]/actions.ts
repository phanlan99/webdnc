"use server";

import { refresh } from "next/cache";
import { describeDbError } from "@/lib/db";
import { validateGlobalConditions, validateRecipe, type GlobalConditionInput, type RecipeError, type RecipeInput } from "@/lib/recipe-rules";
import { createRecipe, deleteRecipe, getProjectTargets, replaceGlobalConditions, replaceProjectRecipes, updateRecipe } from "@/lib/recipe-write";
import { getProjectDetail } from "@/lib/recipes";
import { buildRecipesCsv, readRecipesCsv, readRecipesRows, type CsvExportData, type CsvImportResult, type CsvIssue } from "@/lib/recipe-csv";
import { buildRecipesWorkbook, readWorkbookRows } from "@/lib/recipe-excel";
import { validateAlarm, type AlarmError, type AlarmInput } from "@/lib/alarm-rules";
import { resolveAlarmGroup } from "@/lib/alarms";
import { createAlarm, deleteAlarm, getOtherAlarmCodes, moveAlarm, replaceAlarmGroups, updateAlarm } from "@/lib/alarm-write";
import { getProjectAlarms } from "@/lib/alarms";
import { ALARM_COLUMNS, ALARM_SHEET, ALARM_TEXT_COLUMNS, ROW_ALARM, ROW_ATTACH, alarmRows, buildAlarmsCsv, readAlarmRows, type AlarmFileGroup, type AlarmImportResult } from "@/lib/alarm-file";
import { buildWorkbook } from "@/lib/excel";
import { parseCsv } from "@/lib/recipe-csv";

// ====================================================
// SERVER ACTIONS: thêm / sửa / xóa mã hàng (thay cho thư mục api/)
// Chạy trên server; trình duyệt chỉ gọi hàm và nhận kết quả.
// ====================================================

export type ActionResult = { ok: true } | { ok: false; message: string; errors?: RecipeError[] };

/** Công tắc an toàn: chỉ cho sửa khi .env.local có DNC_WEB_ALLOW_EDIT=true */
function editAllowed(): boolean {
  return process.env.DNC_WEB_ALLOW_EDIT === "true";
}

const PROJECT_CODE = /^[A-Z0-9_-]{1,50}$/;

function cleanProjectCode(code: string): string | null {
  const c = (code ?? "").trim().toUpperCase();
  return PROJECT_CODE.test(c) ? c : null;
}

/** Thêm (recipeId = null) hoặc sửa mã hàng. */
export async function saveRecipeAction(projectCode: string, recipeId: number | null, input: RecipeInput): Promise<ActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };

  // Server luôn kiểm tra lại - không tin dữ liệu gửi từ trình duyệt
  const targets = await getProjectTargets(code);
  const errors = validateRecipe(input, targets);
  if (errors.length > 0) return { ok: false, message: "Dữ liệu chưa hợp lệ.", errors };

  try {
    if (recipeId === null) {
      await createRecipe(code, input);
    } else {
      const found = await updateRecipe(code, recipeId, input);
      if (!found) {
        return {
          ok: false,
          message: "Không còn mã hàng này trong Database (có thể app C# vừa lưu lại dữ liệu). Bấm Làm mới rồi sửa lại.",
        };
      }
    }
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "ER_DUP_ENTRY") return { ok: false, message: `Mã hàng "${input.mahang.trim()}" đã có trong dự án ${code}.` };
    return { ok: false, message: describeDbError(err) };
  }

  refresh(); // hiển thị dữ liệu mới ngay
  return { ok: true };
}

export async function deleteRecipeAction(projectCode: string, recipeId: number): Promise<ActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code || !Number.isInteger(recipeId)) return { ok: false, message: "Dữ liệu không hợp lệ." };

  try {
    const found = await deleteRecipe(code, recipeId);
    if (!found) return { ok: false, message: "Không còn mã hàng này trong Database. Bấm Làm mới để cập nhật danh sách." };
  } catch (err) {
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return { ok: true };
}

// ====================================================
// XUẤT / NHẬP CSV
// ====================================================

export type ExportCsvResult = { ok: true; fileName: string; csv: string } | { ok: false; message: string };

/** Dữ liệu xuất (dùng chung cho CSV và Excel). */
async function loadExportData(code: string): Promise<{ ok: true; data: CsvExportData } | { ok: false; message: string }> {
  const result = await getProjectDetail(code);
  if (!result.ok) return { ok: false, message: result.notFound ? `Không tìm thấy dự án ${code}.` : result.error };
  const p = result.project;
  return {
    ok: true,
    data: {
      globalConditions: p.globalConditions,
      recipes: p.recipes.map((r) => ({
        mahang: r.mahang, description: r.description, useGlobalConditions: r.useGlobalConditions,
        conditions: r.conditions,
        params: r.params.map((x) => ({ ...x, source: (x.source || "FIXED").toUpperCase() })),
      })),
    },
  };
}

const fileStamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

/** Xuất toàn bộ mã hàng + điều kiện chung của dự án ra nội dung CSV (trình duyệt tự tải file về). */
export async function exportRecipesCsvAction(projectCode: string): Promise<ExportCsvResult> {
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };
  const loaded = await loadExportData(code);
  if (!loaded.ok) return loaded;
  return { ok: true, fileName: `mahang_${code}_${fileStamp()}.csv`, csv: buildRecipesCsv(loaded.data) };
}

export type ImportCsvResult =
  | { ok: true; recipes: number; params: number; conditions: number; globals: number | null }
  | { ok: false; message: string; issues?: CsvIssue[] };

const MAX_CSV_CHARS = 900_000; // Server Action mặc định nhận tối đa ~1 MB

/**
 * Nhập CSV: THAY TOÀN BỘ mã hàng của dự án bằng dữ liệu trong file.
 * replaceGlobals = true: thay luôn điều kiện chung bằng các dòng DIEUKIENCHUNG trong file.
 */
export async function importRecipesCsvAction(projectCode: string, csvText: string, replaceGlobals: boolean): Promise<ImportCsvResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };
  if (typeof csvText !== "string" || csvText.length === 0) return { ok: false, message: "File trống." };
  if (csvText.length > MAX_CSV_CHARS) return { ok: false, message: "File quá lớn (tối đa khoảng 900.000 ký tự)." };

  // Server đọc & kiểm tra lại toàn bộ file - không tin kết quả kiểm tra ở trình duyệt
  const targets = await getProjectTargets(code);
  const data = readRecipesCsv(csvText, targets);
  if (data.issues.length > 0) return { ok: false, message: `File có ${data.issues.length} lỗi — chưa ghi gì vào Database.`, issues: data.issues };
  if (data.recipes.length === 0) return { ok: false, message: "File không có mã hàng nào (dòng MAHANG)." };

  try {
    await replaceProjectRecipes(code, data.recipes, replaceGlobals ? data.globalConditions : null);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "ER_DUP_ENTRY") return { ok: false, message: "File có mã hàng trùng nhau (Database không phân biệt chữ hoa / thường)." };
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return {
    ok: true, recipes: data.stats.recipes, params: data.stats.params, conditions: data.stats.conditions,
    globals: replaceGlobals ? data.stats.globals : null,
  };
}

// ====================================================
// ĐIỀU KIỆN CHUNG CỦA DỰ ÁN
// ====================================================

/** Lưu toàn bộ điều kiện chung (danh sách rỗng = xóa hết). */
export async function saveGlobalConditionsAction(projectCode: string, list: GlobalConditionInput[]): Promise<ActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code || !Array.isArray(list)) return { ok: false, message: "Dữ liệu không hợp lệ." };
  if (list.length > 200) return { ok: false, message: "Tối đa 200 điều kiện chung." };

  const targets = await getProjectTargets(code);
  const errors = validateGlobalConditions(list, targets);
  if (errors.length > 0) return { ok: false, message: "Dữ liệu chưa hợp lệ.", errors };

  try {
    await replaceGlobalConditions(code, list);
  } catch (err) {
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return { ok: true };
}

// ====================================================
// XUẤT / NHẬP EXCEL (.xlsx) - cùng cột với CSV, đọc / ghi trên server
// File Excel truyền qua lại dạng base64 (Server Action chỉ nhận dữ liệu dạng chữ / số / đối tượng)
// ====================================================

export type ExportExcelResult = { ok: true; fileName: string; base64: string } | { ok: false; message: string };

export async function exportRecipesExcelAction(projectCode: string): Promise<ExportExcelResult> {
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };
  const loaded = await loadExportData(code);
  if (!loaded.ok) return loaded;
  try {
    const buf = await buildRecipesWorkbook(loaded.data, code, await getProjectTargets(code));
    return { ok: true, fileName: `mahang_${code}_${fileStamp()}.xlsx`, base64: buf.toString("base64") };
  } catch (err) {
    return { ok: false, message: "Không tạo được file Excel: " + (err instanceof Error ? err.message : String(err)) };
  }
}

const MAX_EXCEL_BASE64 = 950_000; // Server Action mặc định nhận tối đa ~1 MB (file Excel khoảng 700 KB)

/** Đọc file Excel (base64) thành dữ liệu mã hàng + kiểm tra. */
async function readExcel(code: string, base64: string): Promise<{ ok: true; data: CsvImportResult } | { ok: false; message: string }> {
  if (typeof base64 !== "string" || base64.length === 0) return { ok: false, message: "File trống." };
  if (base64.length > MAX_EXCEL_BASE64) return { ok: false, message: "File Excel quá lớn (tối đa khoảng 700 KB)." };
  const sheet = await readWorkbookRows(Buffer.from(base64, "base64"));
  if (!sheet.ok) return sheet;
  return { ok: true, data: readRecipesRows(sheet.rows, await getProjectTargets(code)) };
}

export type PreviewExcelResult =
  | { ok: true; stats: CsvImportResult["stats"]; issues: CsvIssue[] }
  | { ok: false; message: string };

/** Xem trước file Excel: chỉ đọc & kiểm tra, KHÔNG ghi Database. */
export async function previewRecipesExcelAction(projectCode: string, base64: string): Promise<PreviewExcelResult> {
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };
  const r = await readExcel(code, base64);
  if (!r.ok) return r;
  return { ok: true, stats: r.data.stats, issues: r.data.issues };
}

/** Nhập file Excel: THAY TOÀN BỘ mã hàng của dự án (giống nhập CSV). */
export async function importRecipesExcelAction(projectCode: string, base64: string, replaceGlobals: boolean): Promise<ImportCsvResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };

  const r = await readExcel(code, base64);
  if (!r.ok) return r;
  const data = r.data;
  if (data.issues.length > 0) return { ok: false, message: `File có ${data.issues.length} lỗi — chưa ghi gì vào Database.`, issues: data.issues };
  if (data.recipes.length === 0) return { ok: false, message: "File không có mã hàng nào (dòng MAHANG)." };

  try {
    await replaceProjectRecipes(code, data.recipes, replaceGlobals ? data.globalConditions : null);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "ER_DUP_ENTRY") return { ok: false, message: "File có mã hàng trùng nhau (Database không phân biệt chữ hoa / thường)." };
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return {
    ok: true, recipes: data.stats.recipes, params: data.stats.params, conditions: data.stats.conditions,
    globals: replaceGlobals ? data.stats.globals : null,
  };
}

// ====================================================
// CẤU HÌNH CẢNH BÁO / LỖI (nhóm: PLC1, PLC2..., FANUC)
// ====================================================

export type AlarmActionResult = { ok: true } | { ok: false; message: string; errors?: AlarmError[] };

/** Thêm (alarmId = null) hoặc sửa 1 cảnh báo. */
export async function saveAlarmAction(projectCode: string, groupKey: string, alarmId: number | null, input: AlarmInput): Promise<AlarmActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  const g = code ? resolveAlarmGroup(code, groupKey) : null;
  if (!code || !g) return { ok: false, message: "Dữ liệu không hợp lệ." };

  try {
    const errors = validateAlarm(input, g.targets, await getOtherAlarmCodes(g, alarmId));
    if (errors.length > 0) return { ok: false, message: "Dữ liệu chưa hợp lệ.", errors };
    if (alarmId === null) await createAlarm(g, input);
    else if (!(await updateAlarm(g, alarmId, input)))
      return { ok: false, message: "Không còn cảnh báo này trong Database (có thể app C# vừa lưu lại). Bấm Làm mới rồi sửa lại." };
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "ER_DUP_ENTRY") return { ok: false, message: `Mã cảnh báo ${input.code.trim().toUpperCase()} đã có trong dự án.` };
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return { ok: true };
}

export async function deleteAlarmAction(projectCode: string, groupKey: string, alarmId: number): Promise<AlarmActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  const g = code ? resolveAlarmGroup(code, groupKey) : null;
  if (!code || !g || !Number.isInteger(alarmId)) return { ok: false, message: "Dữ liệu không hợp lệ." };
  try {
    if (!(await deleteAlarm(g, alarmId))) return { ok: false, message: "Không còn cảnh báo này. Bấm Làm mới để cập nhật danh sách." };
  } catch (err) {
    return { ok: false, message: describeDbError(err) };
  }
  refresh();
  return { ok: true };
}

export async function moveAlarmAction(projectCode: string, groupKey: string, alarmId: number, direction: -1 | 1): Promise<AlarmActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  const g = code ? resolveAlarmGroup(code, groupKey) : null;
  if (!code || !g || !Number.isInteger(alarmId) || (direction !== -1 && direction !== 1)) return { ok: false, message: "Dữ liệu không hợp lệ." };
  try {
    if (!(await moveAlarm(g, alarmId, direction))) return { ok: false, message: "Không còn cảnh báo này. Bấm Làm mới." };
  } catch (err) {
    return { ok: false, message: describeDbError(err) };
  }
  refresh();
  return { ok: true };
}

// ====================================================
// XUẤT / NHẬP FILE CẢNH BÁO / LỖI (CSV + Excel)
// Nhập: chỉ THAY các nhóm (PLC1, PLC2..., FANUC) có trong file, nhóm khác giữ nguyên
// ====================================================

async function loadAlarmGroups(code: string): Promise<{ ok: true; groups: AlarmFileGroup[] } | { ok: false; message: string }> {
  const r = await getProjectAlarms(code);
  if (!r.ok) return { ok: false, message: r.error };
  return {
    ok: true,
    groups: r.groups.map((g) => ({
      key: g.key,
      alarms: g.alarms.map((a) => ({
        enabled: a.enabled, code: a.code, level: a.level, target: a.target, address: a.address, dataType: a.dataType,
        operator: a.operator, value: a.value, length: a.length, reportResolved: a.reportResolved, messageVi: a.messageVi,
        messageEn: a.messageEn, solution: a.solution, note: a.note,
        attachments: a.attachments.map((t) => ({ target: t.target, address: t.address, dataType: t.dataType, length: t.length, name: t.name })),
      })),
    })),
  };
}

export type AlarmExportResult = { ok: true; fileName: string; data: string } | { ok: false; message: string };

/** Xuất CSV (data = nội dung chữ) hoặc Excel (data = base64). */
export async function exportAlarmsAction(projectCode: string, kind: "csv" | "xlsx"): Promise<AlarmExportResult> {
  const code = cleanProjectCode(projectCode);
  if (!code) return { ok: false, message: "Mã dự án không hợp lệ." };
  const loaded = await loadAlarmGroups(code);
  if (!loaded.ok) return loaded;
  const name = `canhbao_${code}_${fileStamp()}`;
  if (kind === "csv") return { ok: true, fileName: `${name}.csv`, data: buildAlarmsCsv(loaded.groups) };

  try {
    const widths: Record<string, number> = { Loai: 11, Nhom: 9, Ma: 10, Bat: 6, MucDo: 10, Nguon: 9, DiaChi: 11, Kieu: 9, SoSanh: 9,
      GiaTri: 10, DoDai: 8, BaoXuLy: 9, NoiDungVI: 32, NoiDungEN: 28, CachXuLy: 32, GhiChu: 20, TenGuiKem: 18 };
    const groupKeys = loaded.groups.map((g) => g.key);
    const buf = await buildWorkbook({
      sheetName: ALARM_SHEET,
      columns: ALARM_COLUMNS.map((c) => ({ key: c, width: widths[c] ?? 12 })),
      rows: alarmRows(loaded.groups),
      textColumns: ALARM_TEXT_COLUMNS,
      numericColumns: ["Bat", "DoDai", "BaoXuLy", "GiaTri"],
      validations: [
        { column: "Loai", items: [ROW_ALARM, ROW_ATTACH] },
        { column: "Nhom", items: groupKeys },
        { column: "Bat", items: ["1", "0"] },
        { column: "MucDo", items: ["LOI", "CANHBAO"] },
        { column: "Nguon", items: ["PLC", "PMC", "MACRO"] },
        { column: "Kieu", items: ["Real", "Bit", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Float", "String"] },
        { column: "SoSanh", items: ["EQ", "NE", "GT", "GE", "LT", "LE"] },
        { column: "BaoXuLy", items: ["1", "0"] },
      ],
      rowStyle: (r) => r.Loai === ROW_ALARM
        ? { bold: true, fill: r.MucDo === "CANHBAO" ? "FFFEF3C7" : "FFFEE2E2" }
        : undefined,
      help: {
        title: `Cảnh báo / lỗi dự án ${code}`,
        lines: [
          ["Nhập file", "Chỉ THAY các nhóm có trong file (PLC1, PLC2..., FANUC). Nhóm không có trong file giữ nguyên."],
          ["Loai = CANHBAO", "1 cảnh báo / lỗi: Nhom, Ma, Bat, MucDo, Nguon, DiaChi, Kieu, SoSanh, GiaTri, DoDai, BaoXuLy, NoiDungVI/EN, CachXuLy, GhiChu"],
          ["Loai = GUIKEM", "Thanh ghi gửi kèm của cảnh báo có cùng Nhom + Ma: Nguon, DiaChi, Kieu, DoDai, TenGuiKem"],
          ["Nhom", `Nhóm của dự án: ${groupKeys.join(", ")} (PLC1 = PLC chính)`],
          ["MucDo", "LOI = lỗi (đỏ), CANHBAO = cảnh báo (vàng)"],
          ["Nguon", "Nhóm PLC: PLC | Nhóm FANUC: PMC hoặc MACRO"],
          ["Điều kiện", "Phát sinh khi DiaChi SoSanh GiaTri chuyển SAI -> ĐÚNG (bit: 0 -> 1). Bit / String chỉ dùng EQ, NE"],
          ["BaoXuLy", "1 = báo ĐÃ XỬ LÝ khi điều kiện hết đúng"],
          ["Thứ tự dòng", "Thứ tự cảnh báo trong nhóm = thứ tự các dòng CANHBAO"],
        ],
      },
    });
    return { ok: true, fileName: `${name}.xlsx`, data: buf.toString("base64") };
  } catch (err) {
    return { ok: false, message: "Không tạo được file Excel: " + (err instanceof Error ? err.message : String(err)) };
  }
}

/** Đọc file (CSV: chữ | Excel: base64) thành bảng rồi kiểm tra. */
async function readAlarmFile(kind: "csv" | "xlsx", payload: string): Promise<{ ok: true; data: AlarmImportResult } | { ok: false; message: string }> {
  if (typeof payload !== "string" || payload.length === 0) return { ok: false, message: "File trống." };
  if (payload.length > 950_000) return { ok: false, message: "File quá lớn (tối đa khoảng 700 KB)." };
  if (kind === "csv") return { ok: true, data: readAlarmRows(parseCsv(payload)) };
  const sheet = await readWorkbookRows(Buffer.from(payload, "base64"), ALARM_SHEET);
  if (!sheet.ok) return sheet;
  return { ok: true, data: readAlarmRows(sheet.rows) };
}

export type AlarmPreviewResult =
  | { ok: true; stats: AlarmImportResult["stats"]; issues: AlarmImportResult["issues"]; groups: { key: string; count: number }[] }
  | { ok: false; message: string };

/** Xem trước file Excel cảnh báo (server đọc), KHÔNG ghi Database. CSV được xem trước ngay trên trình duyệt. */
export async function previewAlarmsExcelAction(projectCode: string, base64: string): Promise<AlarmPreviewResult> {
  if (!cleanProjectCode(projectCode)) return { ok: false, message: "Mã dự án không hợp lệ." };
  const r = await readAlarmFile("xlsx", base64);
  if (!r.ok) return r;
  return { ok: true, stats: r.data.stats, issues: r.data.issues, groups: r.data.groups.map((g) => ({ key: g.key, count: g.alarms.length })) };
}

export type AlarmImportActionResult =
  | { ok: true; alarms: number; groups: string[] }
  | { ok: false; message: string; issues?: AlarmImportResult["issues"] };

/** Nhập file: thay toàn bộ cảnh báo của các nhóm có trong file. */
export async function importAlarmsAction(projectCode: string, kind: "csv" | "xlsx", payload: string): Promise<AlarmImportActionResult> {
  if (!editAllowed()) return { ok: false, message: "Chức năng chỉnh sửa đang TẮT (DNC_WEB_ALLOW_EDIT trong .env.local)." };
  const code = cleanProjectCode(projectCode);
  if (!code || (kind !== "csv" && kind !== "xlsx")) return { ok: false, message: "Dữ liệu không hợp lệ." };

  const r = await readAlarmFile(kind, payload);
  if (!r.ok) return r;
  if (r.data.issues.length > 0) return { ok: false, message: `File có ${r.data.issues.length} lỗi — chưa ghi gì vào Database.`, issues: r.data.issues };
  if (r.data.groups.length === 0) return { ok: false, message: "File không có cảnh báo nào (dòng CANHBAO)." };

  try {
    await replaceAlarmGroups(code, r.data.groups);
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "ER_DUP_ENTRY") return { ok: false, message: "File có mã cảnh báo trùng nhau trong cùng nhóm." };
    return { ok: false, message: describeDbError(err) };
  }

  refresh();
  return { ok: true, alarms: r.data.stats.alarms, groups: r.data.groups.map((g) => g.key) };
}