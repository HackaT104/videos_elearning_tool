// Kiểu cho stage.mjs (để test TypeScript import được).
export function skipped(rel: string): boolean;
export function stage(root: string, out: string, log?: (s: string) => void): { files: number; bytes: number; links: [string, string][] };
