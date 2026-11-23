// ====================================================
// QUY TẮC CẤU HÌNH CẢNH BÁO / LỖI (giống app C# DNC - tab CÀI ĐẶT > PLC / FANUC > CẢNH BÁO)
// Dùng chung: trình duyệt kiểm tra khi nhập, server kiểm tra lại trước khi ghi Database.
//  - PHÁT SINH khi điều kiện chuyển SAI -> ĐÚNG (bit: sườn lên 0 -> 1)
//  - ĐÃ XỬ LÝ khi điều kiện chuyển ĐÚNG -> SAI nếu bật "Báo xử lý"
// ====================================================

import { OPERATORS, checkAddress, checkValue, typesFor } from "@/lib/recipe-rules";

/** Nguồn thanh ghi của 1 nhóm cảnh báo; null = mã nhóm không hợp lệ. PLC1, PLC2..PLC99 -> PLC; FANUC -> PMC + Macro. */
export function alarmGroupTargets(groupKey: string): string[] | null {
  const g = (groupKey ?? "").toUpperCase();
  if (g === "FANUC") return ["PMC", "MACRO"];
  if (g === "PLC1" || /^PLC([2-9]|[1-9]\d)$/.test(g)) return ["PLC"];
  return null;
}

export const ALARM_LEVELS = [
  { code: "ERROR", label: "Lỗi" },
  { code: "WARNING", label: "Cảnh báo" },
];

export type AlarmAttachInput = {
  target: string;     // PLC | PMC | MACRO
  address: string;
  dataType: string;
  length: number;
  name: string;
};

export type AlarmInput = {
  enabled: boolean;
  code: string;
  level: string;      // ERROR | WARNING
  target: string;     // PLC (nhóm PLC) | PMC / MACRO (nhóm FANUC)
  address: string;
  dataType: string;
  operator: string;   // EQ NE GT GE LT LE
  value: string;
  length: number;
  reportResolved: boolean;
  messageVi: string;
  messageEn: string;
  solution: string;
  note: string;
  attachments: AlarmAttachInput[];
};

export type AlarmError = { field?: string; attachIndex?: number; message: string };

/** Mã gợi ý cho cảnh báo mới: PLC -> AL001, AL002...; FANUC -> FA001... (giống app C#) */
export function nextAlarmCode(existing: string[], isFanuc: boolean): string {
  const prefix = isFanuc ? "FA" : "AL";
  const used = new Set(existing.map((c) => c.toUpperCase()));
  for (let n = existing.length + 1; ; n++) {
    const code = `${prefix}${String(n).padStart(3, "0")}`;
    if (!used.has(code)) return code;
  }
}

/**
 * Kiểm tra 1 cảnh báo.
 * targets      : nguồn được dùng (nhóm PLC: ["PLC"], nhóm FANUC: ["PMC", "MACRO"])
 * otherCodes   : mã các cảnh báo KHÁC trong cùng nhóm (để chặn trùng mã)
 */
export function validateAlarm(a: AlarmInput, targets: string[], otherCodes: string[]): AlarmError[] {
  const errors: AlarmError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  const code = (a.code ?? "").trim().toUpperCase();

  if (!code) add("code", "Chưa nhập mã cảnh báo");
  else if (code.length > 50) add("code", "Mã cảnh báo tối đa 50 ký tự");
  else if (otherCodes.some((c) => c.toUpperCase() === code)) add("code", `Mã ${code} đã có trong nhóm này`);
  if (!ALARM_LEVELS.some((l) => l.code === a.level)) add("level", "Loại phải là Lỗi hoặc Cảnh báo");

  if (!targets.includes(a.target)) add("target", "Nguồn không hợp lệ");
  else if (!typesFor(a.target).includes(a.dataType)) add("dataType", `Kiểu ${a.dataType} không dùng cho nguồn này`);
  else {
    const aErr = checkAddress(a.target, a.dataType, a.address, false);
    if (aErr) add("address", "Thanh ghi: " + aErr);
    if (!OPERATORS.some((o) => o.code === a.operator)) add("operator", "Phép so sánh không hợp lệ");
    else if ((a.dataType === "Bit" || a.dataType === "String") && a.operator !== "EQ" && a.operator !== "NE")
      add("operator", `Kiểu ${a.dataType} chỉ so sánh = hoặc ≠`);
    if (a.dataType === "String" && (!Number.isInteger(a.length) || a.length < 1 || a.length > 100)) add("length", "Độ dài chuỗi từ 1 đến 100 word");
    const vErr = checkValue(a.dataType, a.value, a.length);
    if (vErr) add("value", "Giá trị so sánh: " + vErr);
  }

  if ((a.messageVi ?? "").length > 500) add("messageVi", "Nội dung (VI) tối đa 500 ký tự");
  if ((a.messageEn ?? "").length > 500) add("messageEn", "Nội dung (EN) tối đa 500 ký tự");
  if ((a.solution ?? "").length > 1000) add("solution", "Cách xử lý tối đa 1000 ký tự");
  if ((a.note ?? "").length > 500) add("note", "Ghi chú tối đa 500 ký tự");
  if (a.attachments.length > 50) add("attachments", "Tối đa 50 thanh ghi gửi kèm");

  a.attachments.forEach((t, i) => {
    const push = (m: string) => errors.push({ attachIndex: i, message: `Gửi kèm ${i + 1}: ${m}` });
    if (!targets.includes(t.target)) return push("nguồn không hợp lệ");
    if (!typesFor(t.target).includes(t.dataType)) return push(`kiểu ${t.dataType} không dùng cho nguồn này`);
    if (t.dataType === "String" && (!Number.isInteger(t.length) || t.length < 1 || t.length > 100)) return push("độ dài chuỗi từ 1 đến 100 word");
    const e = checkAddress(t.target, t.dataType, t.address, false);
    if (e) return push(e);
    if ((t.name ?? "").length > 255) push("tên tối đa 255 ký tự");
  });

  return errors;
}