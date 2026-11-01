"use client";
import { useApi } from "@/lib/hooks";
import { useProject, type VideoSum } from "@/lib/project";
import { PageHead, VideoPicker } from "@/components/ui";

export default function KichBanIndex() {
  const { project } = useProject();
  const { data } = useApi<VideoSum[]>(`/projects/${project!.id}/videos`);
  return (
    <div>
      <PageHead step={4} title="Kịch bản" />
      <p className="mb-2 text-sm text-soft">Chọn video để sửa kịch bản theo cảnh (mỗi câu một dòng, cột lời thoại và cột cách đọc).</p>
      {data && <VideoPicker pid={project!.id} videos={data} base="kich-ban" />}
    </div>
  );
}
