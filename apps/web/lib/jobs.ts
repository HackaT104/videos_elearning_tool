import { api } from "./api";
export async function waitJob(id: number, onTick?: (j: any) => void, maxSec = 3600): Promise<any> {
  for (let i = 0; i < maxSec; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const j = await api<any>(`/jobs/${id}`);
    onTick?.(j);
    if (j.status === "done") return j;
    if (j.status === "failed") throw new Error(j.error ?? "Job lỗi");
    if (j.status === "canceled") throw new Error("Đã hủy");
  }
  throw new Error("Hết thời gian chờ");
}
