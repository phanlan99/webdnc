// Khung chờ hiển thị trong lúc đang đọc Database
export default function ProjectListSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải danh sách dự án">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </div>
    </div>
  );
}