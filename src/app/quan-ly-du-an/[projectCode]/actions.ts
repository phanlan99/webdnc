"use server";

import { refresh } from "next/cache";
import { describeDbError } from "@/lib/db";
import { validateRecipe, type RecipeError, type RecipeInput } from "@/lib/recipe-rules";
import { createRecipe, deleteRecipe, getProjectTargets, updateRecipe } from "@/lib/recipe-write";

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