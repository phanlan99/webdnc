import "server-only"; // báo lỗi ngay nếu lỡ import file này vào code chạy trên trình duyệt
import mysql from "mysql2/promise";

// ====================================================
// KẾT NỐI DATABASE DncControl (MySQL) - dùng chung với app C# DNC
// Thông tin kết nối lấy từ file .env.local (xem .env.example)
// Chỉ chạy trên server: mật khẩu không bao giờ gửi xuống trình duyệt
// ====================================================

declare global {
  // Giữ 1 pool duy nhất khi "npm run dev" tự tải lại code (tránh mở quá nhiều kết nối)
  var __dncPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host: process.env.DNC_DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DNC_DB_PORT ?? 3306),
    database: process.env.DNC_DB_NAME ?? "DncControl",
    user: process.env.DNC_DB_USER ?? "root",
    password: process.env.DNC_DB_PASSWORD ?? "",
    charset: "utf8mb4",
    connectionLimit: 10,
    connectTimeout: 5000,
    dateStrings: true, // ngày giờ trả về dạng chuỗi "yyyy-MM-dd HH:mm:ss", không bị lệch múi giờ
  });
}

export function getDb(): mysql.Pool {
  if (!globalThis.__dncPool) globalThis.__dncPool = createPool();
  return globalThis.__dncPool;
}

/** Truy vấn SELECT có tham số. Luôn truyền giá trị qua "?" để tránh SQL injection. */
export async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await getDb().query(sql, params);
  return rows as T[];
}

/** Đổi lỗi MySQL thường gặp thành lời nhắn dễ hiểu (dùng chung cho mọi truy vấn). */
export function describeDbError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  switch (e.code) {
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "EHOSTUNREACH":
      return `Không kết nối được máy chủ MySQL (${process.env.DNC_DB_HOST ?? "chưa cấu hình"}:${process.env.DNC_DB_PORT ?? "3306"}). Kiểm tra IP, Port, tường lửa và file .env.local.`;
    case "ER_ACCESS_DENIED_ERROR":
      return "Sai tài khoản hoặc mật khẩu MySQL. Kiểm tra DNC_DB_USER / DNC_DB_PASSWORD trong .env.local (mật khẩu nên đặt trong dấu nháy kép).";
    case "ER_BAD_DB_ERROR":
      return `Không tìm thấy database "${process.env.DNC_DB_NAME ?? "DncControl"}". Kiểm tra DNC_DB_NAME trong .env.local.`;
    case "ER_NO_SUCH_TABLE":
      return "Database chưa có đủ bảng dữ liệu DNC. Hãy mở app C# DNC kết nối Database một lần để tự tạo bảng.";
    default:
      return e.message ?? String(err);
  }
}