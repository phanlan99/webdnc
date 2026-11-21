import Link from "next/link";

// Hiển thị khi mở /quan-ly-du-an/<mã> mà mã dự án không có trong Database
export default function ProjectNotFound() {
  return (
    <div className="flex min-h-screen items-start justify-center bg-slate-50 px-6 pt-24">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-4xl">🔍</p>
        <h1 className="mt-3 text-xl font-semibold text-slate-800">Không tìm thấy dự án</h1>
        <p className="mt-2 text-sm text-slate-500">Mã dự án này không có trong bảng dnc_project.</p>
        <Link href="/quan-ly-du-an" className="mt-5 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Về danh sách dự án
        </Link>
      </div>
    </div>
  );
}