"use server";

import { refresh } from "next/cache";
import { describeDbError } from "@/lib/db";
import { validateGlobalConditions, validateRecipe, type GlobalConditionInput, type RecipeError, type RecipeInput } from "@/lib/recipe-rules";
import { createRecipe, deleteRecipe, getProjectTargets, replaceGlobalConditions, replaceProjectRecipes, updateRecipe } from "@/lib/recipe-write";
import { getProjectDetail } from "@/lib/recipes";
import { buildRecipesCsv, readRecipesCsv, readRecipesRows, type CsvExportData, type CsvImportResult, type CsvIssue } from "@/lib/recipe-csv";
import { buildRecipesWorkbook, readWorkbookRows } from "@/lib/recipe-excel";

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