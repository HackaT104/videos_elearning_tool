import { redirect } from "next/navigation";
export default async function P({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/p/${(await params).id}/nguon`);
}
