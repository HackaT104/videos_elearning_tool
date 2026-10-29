"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Tải dữ liệu + tự làm mới theo chu kỳ (ms). */
export function useApi<T>(path: string | null, interval = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const load = useCallback(async () => {
    if (!path) return;
    try {
      const d = await api<T>(path);
      if (alive.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    load();
    if (!interval) return () => void (alive.current = false);
    const t = setInterval(load, interval);
    return () => {
      alive.current = false;
      clearInterval(t);
    };
  }, [load, interval]);
  return { data, error, reload: load, setData };
}

/** Chạy hành động bất đồng bộ, giữ trạng thái bận + thông báo lỗi. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, msg, run, setMsg };
}
