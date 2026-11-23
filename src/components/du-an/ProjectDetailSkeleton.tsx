// Khung chờ trong lúc đang đọc dữ liệu dự án (cùng bố cục với trang thật)
export default function ProjectDetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải dữ liệu dự án">
      <div className="flex items-center justify-between gap-4">
        <div className="h-9 w-72 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-2xl bg-white shadow-sm ring-1 ring-slate-200" />
    </div>
  );
}