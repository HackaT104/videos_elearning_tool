// Sinh file mẫu (fixtures/*.docx, *.xlsx) nếu chưa có – để test chạy được ngay sau khi clone.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

export default function setup() {
  const root = join(import.meta.dirname, "..");
  const need = ["Kich_ban_L1.docx", "Outline_L2.docx", "Kich_ban_L2.xlsx"].some((f) => !existsSync(join(root, "fixtures", f)));
  if (need) execFileSync(process.execPath, ["--import", "tsx", join(root, "scripts", "make-fixtures.ts")], { stdio: "inherit", cwd: root });
}
