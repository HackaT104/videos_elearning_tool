"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { useAction, useApi } from "@/lib/hooks";
import { Badge, Msg } from "@/components/ui";

/** Khoá Pexels (miễn phí) để "Tìm ảnh miễn phí" tìm thêm trên Pexels. Khoá lưu trên máy chạy ứng dụng, không gửi lại trình duyệt. */
export function StockKey() {
  const s = useApi<{ pexels: boolean; userAgent: string }>("/stock/settings");
  const a = useAction();
  const [key, setKey] = useState("");
  const save = (pexelsKey: string | null, ok: string) =>
    a.run(async () => {
      s.setData({ ...(s.data ?? { userAgent: "" }), ...(await api<{ pexels: boolean }>("/stock/settings", { method: "PUT", json: { pexelsKey } })) });
      setKey("");
    }, ok);
  return (
    <section className="card mt-4" aria-labelledby="stock">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="stock" className="font-semibold">Ảnh miễn phí cho cảnh</h2>
        {s.data && (s.data.pexels ? <Badge tone="green">có khoá Pexels</Badge> : <Badge>Openverse + Wikimedia</Badge>)}
      </div>
      <p className="mb-2 text-sm text-soft">Nút "Tìm ảnh miễn phí" ở bước Kịch bản tìm trên Openverse và Wikimedia Commons (không cần khoá). Thêm khoá Pexels miễn phí để tìm cả ảnh Pexels.</p>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); save(key, "Đã lưu khoá Pexels"); }}>
        <label className="sr-only" htmlFor="pexels-key">Khoá API Pexels</label>
        <input id="pexels-key" className="input min-w-0 flex-1" type="password" autoComplete="off" placeholder={s.data?.pexels ? "Đã có khoá – dán khoá mới để thay" : "Dán khoá API Pexels"} value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="btn btn-primary" disabled={a.busy || !key.trim()}>Lưu khoá</button>
        {s.data?.pexels && <button type="button" className="btn" disabled={a.busy} onClick={() => save(null, "Đã xoá khoá Pexels")}>Xoá khoá</button>}
      </form>
      <Msg msg={a.msg} />
      <p className="mt-2 text-[12px] text-soft">Lấy khoá tại pexels.com/api (cần tài khoản Pexels). Ảnh Pexels dùng thương mại được; ứng dụng vẫn ghi tên tác giả trong credits.txt khi xuất.</p>
    </section>
  );
}
