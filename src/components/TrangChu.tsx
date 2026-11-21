// ====================================================
// TRANG CHỦ - lời chào + animation bánh răng đơn giản
// Chiếm toàn bộ phần bên phải sidebar, nền sáng; nội dung căn giữa theo chiều ngang, nằm ở phía trên
// ====================================================

export default function TrangChu() {
  return (
    <main className="relative flex flex-1 items-start justify-center overflow-hidden bg-linear-to-br from-white via-slate-50 to-blue-50 px-6 pt-12 pb-12 md:pt-20">
      {/* Vòng sáng trang trí phía sau */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-blue-100/70 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-sky-100/70 blur-3xl" />

      <div className="relative flex max-w-2xl flex-col items-center text-center">
        <span className="rounded-full border border-blue-200 bg-white/80 px-4 py-1 text-xs font-medium text-blue-700">
          Hệ thống quản lý DNC
        </span>

        <h1 className="mt-5 text-3xl leading-tight font-bold text-slate-800 sm:text-4xl md:text-5xl">
          Chào mừng bạn đến với
          <br />
          <span className="text-blue-600">trang quản lý DNC</span>
        </h1>

        <p className="mt-4 max-w-lg text-base text-slate-500 sm:text-lg">
          Quản lý mã hàng, cảnh báo và dữ liệu gửi xuống FANUC / PLC ngay trên trình duyệt.
        </p>

        {/* Animation: 2 bánh răng quay ngược chiều nhau */}
        <div aria-hidden="true" className="mt-12 flex items-end">
          <Gear className="size-24 animate-spin text-blue-500 [animation-duration:8s] motion-reduce:animate-none sm:size-28" />
          <Gear className="mb-10 -ml-3 size-14 animate-spin text-sky-400 [animation-direction:reverse] [animation-duration:5s] motion-reduce:animate-none sm:size-16" />
        </div>

        {/* Animation: 3 chấm nhảy lần lượt */}
        <div aria-hidden="true" className="mt-6 flex gap-2">
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="size-2.5 animate-bounce rounded-full bg-blue-500 motion-reduce:animate-none"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-400">Hệ thống đang hoạt động</p>
      </div>
    </main>
  );
}

/** Bánh răng vẽ bằng SVG: 8 răng + thân tròn + lỗ giữa. */
function Gear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className}>
      <g fill="currentColor">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="43" y="3" width="14" height="20" rx="3" transform={`rotate(${i * 45} 50 50)`} />
        ))}
        <circle cx="50" cy="50" r="33" />
      </g>
      <circle cx="50" cy="50" r="12" fill="white" />
    </svg>
  );
}