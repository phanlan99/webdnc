// ====================================================
// QUY TẮC DỮ LIỆU MÃ HÀNG (giống app C# DNC)
// Dùng chung: trình duyệt kiểm tra ngay khi nhập, server kiểm tra lại trước khi ghi Database.
// Cột "Kiểm tra" trong app C# vẫn là nơi kiểm tra cuối cùng trước khi gửi xuống máy.
// ====================================================

export type ConditionInput = {
  enabled: boolean;
  target: string;     // MACRO / PMC / PLC / PLC:PLC2 ...
  address: string;
  dataType: string;
  operator: string;   // EQ NE GT GE LT LE
  value: string;
  length: number;
  note: string;
};

export type ParamInput = {
  enabled: boolean;
  target: string;
  address: string;
  dataType: string;
  value: string;
  length: number;
  note: string;
  source: string;         // FIXED = giá trị cố định; hoặc thiết bị nguồn khi sao chép
  sourceAddress: string;
  sourceType: string;
};

export type RecipeInput = {
  mahang: string;
  description: string;
  useGlobalConditions: boolean;
  conditions: ConditionInput[];
  params: ParamInput[];
};

export type RecipeError = { scope: "info" | "condition" | "param"; index?: number; message: string };

export const OPERATORS = [
  { code: "EQ", label: "=" },
  { code: "NE", label: "≠" },
  { code: "GT", label: ">" },
  { code: "GE", label: "≥" },
  { code: "LT", label: "<" },
  { code: "LE", label: "≤" },
];

export const SOURCE_FIXED = "FIXED";
export const BASE_TARGETS = ["MACRO", "PMC", "PLC"];

const PMC_TYPES = ["Bit", "Byte", "Int16", "Int32", "Float"];
const PLC_TYPES = ["Bit", "Int16", "UInt16", "Int32", "UInt32", "Float", "String"];
const PMC_READ_AREAS = ["X", "Y", "F", "G", "R", "D", "K", "C", "A", "T", "E"];
const PMC_WRITE_AREAS = ["Y", "R", "D", "K", "C"];
const PLC_BIT_DEVICES = ["X", "Y", "M", "L", "B", "SM"];
const PLC_WORD_DEVICES = ["D", "R", "W", "SD"];
const PLC_WRITE_DEVICES = ["Y", "M", "L", "B", "D", "R", "W"];

export const isPlc = (target: string) => target === "PLC" || target.startsWith("PLC:");

export function typesFor(target: string): string[] {
  if (target === "MACRO") return ["Real"];
  if (target === "PMC") return PMC_TYPES;
  if (isPlc(target)) return PLC_TYPES;
  return [];
}

export function defaultType(target: string): string {
  return target === "MACRO" ? "Real" : target === "PMC" ? "Int16" : "Int16";
}

/** Chuẩn hóa địa chỉ: viết hoa, bỏ khoảng trắng, Macro bỏ dấu "#". */
export function normalizeAddress(target: string, address: string): string {
  const a = (address ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return target === "MACRO" ? a.replace(/^#/, "") : a;
}

/** Kiểm tra địa chỉ. forWrite = true: địa chỉ để GHI (tham số gửi) -> chỉ vùng ghi được. */
export function checkAddress(target: string, dataType: string, address: string, forWrite: boolean): string | null {
  const a = normalizeAddress(target, address);
  if (!a) return "chưa nhập địa chỉ";

  if (target === "MACRO") {
    if (!/^\d+$/.test(a)) return "biến Macro phải là số (VD: 500)";
    const n = Number(a);
    if (n < 0 || n > 32767) return "biến Macro phải từ 0 đến 32767";
    return null;
  }

  if (target === "PMC") {
    const m = /^([A-Z])(\d+)(?:\.(\d+))?$/.exec(a);
    if (!m) return "địa chỉ PMC dạng R100, D200 hoặc R100.3 (bit)";
    const [, area, , bit] = m;
    if (!PMC_READ_AREAS.includes(area)) return `vùng PMC "${area}" không hợp lệ`;
    if (forWrite && !PMC_WRITE_AREAS.includes(area)) return `vùng PMC "${area}" chỉ đọc (ghi được: ${PMC_WRITE_AREAS.join(", ")})`;
    if (dataType === "Bit") {
      if (bit === undefined) return "kiểu Bit cần số bit (VD: R100.3)";
      if (Number(bit) > 7) return "số bit phải từ 0 đến 7";
    } else if (bit !== undefined) return "chỉ kiểu Bit mới có số bit sau dấu chấm";
    return null;
  }

  if (isPlc(target)) {
    const m = /^(SM|SD|X|Y|M|L|B|D|R|W)([0-9A-F]+)$/.exec(a);
    if (!m) return "địa chỉ PLC dạng M100, D200, X10, Y0...";
    const [, dev, num] = m;
    if ((dev === "X" || dev === "Y") && !/^[0-7]+$/.test(num)) return `${dev} dùng số hệ 8 (chỉ chữ số 0-7)`;
    if (dev !== "X" && dev !== "Y" && !/^\d+$/.test(num)) return "số thanh ghi phải là số thập phân";
    if (PLC_BIT_DEVICES.includes(dev) && dataType !== "Bit") return `${dev} là thiết bị bit, kiểu phải là Bit`;
    if (PLC_WORD_DEVICES.includes(dev) && dataType === "Bit") return `${dev} là thanh ghi word, không chọn kiểu Bit`;
    if (forWrite && !PLC_WRITE_DEVICES.includes(dev)) return `${dev} chỉ đọc (ghi được: ${PLC_WRITE_DEVICES.join(", ")})`;
    return null;
  }

  return "thiết bị không hợp lệ";
}

/** Kiểm tra giá trị theo kiểu dữ liệu. */
export function checkValue(dataType: string, value: string, length: number): string | null {
  const v = (value ?? "").trim();
  if (dataType === "String") {
    if ((value ?? "").length > length * 2) return `chuỗi dài tối đa ${length * 2} ký tự (${length} word)`;
    return null;
  }
  if (v === "") return "chưa nhập giá trị";
  if (dataType === "Bit") return v === "0" || v === "1" ? null : "kiểu Bit chỉ nhận 0 hoặc 1";
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return "giá trị phải là số";
  const n = Number(v);
  const ranges: Record<string, [number, number]> = {
    Byte: [0, 255], Int16: [-32768, 32767], UInt16: [0, 65535], Int32: [-2147483648, 2147483647], UInt32: [0, 4294967295],
  };
  const r = ranges[dataType];
  if (r) {
    if (!Number.isInteger(n)) return `kiểu ${dataType} phải là số nguyên`;
    if (n < r[0] || n > r[1]) return `kiểu ${dataType} từ ${r[0]} đến ${r[1]}`;
  }
  return null;
}

/** Kiểm tra toàn bộ mã hàng. allowedTargets: các thiết bị dự án đang có (MACRO, PMC, PLC, PLC:PLC2...). */
export function validateRecipe(input: RecipeInput, allowedTargets: string[]): RecipeError[] {
  const errors: RecipeError[] = [];
  const mahang = (input.mahang ?? "").trim();
  if (!mahang) errors.push({ scope: "info", message: "Chưa nhập mã hàng" });
  else if (mahang.length > 100) errors.push({ scope: "info", message: "Mã hàng tối đa 100 ký tự" });
  if ((input.description ?? "").length > 255) errors.push({ scope: "info", message: "Mô tả tối đa 255 ký tự" });

  const targetOk = (t: string) => allowedTargets.includes(t);
  const lenOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= 100;

  input.conditions.forEach((c, i) => {
    const add = (m: string) => errors.push({ scope: "condition", index: i, message: `Điều kiện ${i + 1}: ${m}` });
    if (!targetOk(c.target)) return add("thiết bị không có trong dự án");
    if (!typesFor(c.target).includes(c.dataType)) return add(`kiểu ${c.dataType} không dùng cho thiết bị này`);
    if (!OPERATORS.some((o) => o.code === c.operator)) return add("phép so sánh không hợp lệ");
    if ((c.dataType === "Bit" || c.dataType === "String") && c.operator !== "EQ" && c.operator !== "NE")
      return add(`kiểu ${c.dataType} chỉ so sánh = hoặc ≠`);
    if (c.dataType === "String" && !lenOk(c.length)) return add("độ dài chuỗi từ 1 đến 100 word");
    const aErr = checkAddress(c.target, c.dataType, c.address, false);
    if (aErr) return add(aErr);
    const vErr = checkValue(c.dataType, c.value, c.length);
    if (vErr) return add(vErr);
    if ((c.note ?? "").length > 255) add("ghi chú tối đa 255 ký tự");
  });

  input.params.forEach((p, i) => {
    const add = (m: string) => errors.push({ scope: "param", index: i, message: `Tham số ${i + 1}: ${m}` });
    if (!targetOk(p.target)) return add("thiết bị không có trong dự án");
    if (!typesFor(p.target).includes(p.dataType)) return add(`kiểu ${p.dataType} không dùng cho thiết bị này`);
    if (p.dataType === "String" && !lenOk(p.length)) return add("độ dài chuỗi từ 1 đến 100 word");
    const aErr = checkAddress(p.target, p.dataType, p.address, true);
    if (aErr) return add(aErr);
    if (p.source === SOURCE_FIXED) {
      const vErr = checkValue(p.dataType, p.value, p.length);
      if (vErr) return add(vErr);
    } else {
      if (!targetOk(p.source)) return add("nguồn sao chép không có trong dự án");
      if (!typesFor(p.source).includes(p.sourceType)) return add(`kiểu nguồn ${p.sourceType} không dùng cho thiết bị nguồn`);
      const sErr = checkAddress(p.source, p.sourceType, p.sourceAddress, false);
      if (sErr) return add("nguồn: " + sErr);
    }
    if ((p.note ?? "").length > 255) add("ghi chú tối đa 255 ký tự");
  });

  return errors;
}