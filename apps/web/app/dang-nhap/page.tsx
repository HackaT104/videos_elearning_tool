export default async function DangNhap({ searchParams }: { searchParams: Promise<{ sai?: string; next?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto mt-10 max-w-sm">
      <form method="post" action="/dang-nhap" className="card space-y-3">
        <h1 className="text-xl font-bold">Nhập mã PIN</h1>
        <p className="text-sm text-soft">Bạn đang mở Course Video Studio từ thiết bị khác. Mã PIN do người cài đặt đặt trong file .env (CVS_ACCESS_PIN) trên máy tính.</p>
        <input type="hidden" name="next" value={sp.next ?? "/"} />
        <input name="pin" type="password" inputMode="numeric" autoComplete="current-password" autoFocus className="input text-lg tracking-widest" placeholder="••••••" />
        {sp.sai && <div className="text-sm text-danger">Mã PIN không đúng.</div>}
        <button className="btn btn-primary w-full justify-center" type="submit">Vào ứng dụng</button>
      </form>
    </div>
  );
}
