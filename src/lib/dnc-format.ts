// ====================================================
// HIỂN THỊ MÃ LƯU TRONG DATABASE THÀNH CHỮ DỄ ĐỌC (giống app C#)
// Dùng được cả trên server lẫn trình duyệt (không truy cập Database)
// ====================================================

/** target_kind / source_kind -> tên thiết bị. VD: MACRO -> "FANUC Macro", PLC:PLC2 -> "PLC FX5U [PLC2]" */
export function targetLabel(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  if (c === "MACRO") return "FANUC Macro";
  if (c === "PMC") return "FANUC PMC";
  if (c === "PLC") return "PLC FX5U";
  if (c.startsWith("PLC:")) return `PLC FX5U [${c.slice(4)}]`;
  if (c === "FIXED" || c === "") return "Giá trị cố định";
  return code;
}

/** Màu nhãn theo loại thiết bị (Tailwind). */
export function targetColor(code: string): string {
  const c = (code ?? "").trim().toUpperCase();
  if (c === "MACRO") return "bg-violet-50 text-violet-700";
  if (c === "PMC") return "bg-amber-50 text-amber-700";
  if (c.startsWith("PLC")) return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-600";
}

/** Địa chỉ hiển thị: biến Macro thêm "#" phía trước (500 -> #500). */
export function addressLabel(targetCode: string, address: string): string {
  const c = (targetCode ?? "").trim().toUpperCase();
  const a = (address ?? "").trim();
  if (!a) return "—";
  return c === "MACRO" && !a.startsWith("#") ? `#${a}` : a;
}

/** compare_op -> ký hiệu so sánh. */
export function operatorLabel(op: string): string {
  switch ((op ?? "").trim().toUpperCase()) {
    case "EQ": return "=";
    case "NE": return "≠";
    case "GT": return ">";
    case "GE": return "≥";
    case "LT": return "<";
    case "LE": return "≤";
    default: return op;
  }
}

/** "2026-10-23 09:15:02" -> "23/10/2026 09:15" */
export function formatDate(value: string | null): string {
  if (!value) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : value;
}