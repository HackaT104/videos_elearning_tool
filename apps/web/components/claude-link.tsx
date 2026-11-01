"use client";
import Link from "next/link";
import { useApi } from "@/lib/hooks";

export function ClaudeLink() {
  const { data } = useApi<{ available: boolean }>("/claude/status", 15000);
  return (
    <Link href="/claude" className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${data?.available ? "bg-emerald-500" : "bg-slate-300"}`} />
      Claude AI
    </Link>
  );
}
