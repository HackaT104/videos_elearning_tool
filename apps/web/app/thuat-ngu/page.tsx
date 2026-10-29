"use client";
import { GlossaryEditor } from "@/components/glossary";
import { PageHead } from "@/components/ui";

export default function ThuatNgu() {
  return (
    <div>
      <PageHead title="Thuật ngữ dùng chung" />
      <div className="card"><GlossaryEditor project={null} /></div>
    </div>
  );
}
