// Kiểu cho launcher.mjs (để test TypeScript import được).
export type AppPaths = { appDir: string; nodeDir: string; data: string; storage: string; runtime: string; logFile: string; envFile: string; marker: string; edgeProfile: string; lock: string };
type Env = Record<string, string | undefined>;
export const APP_DIR: string;
export function appPaths(env?: Env, appDir?: string, nodeExe?: string): AppPaths;
export function buildEnv(base: Env, p: AppPaths, user?: Record<string, string>): Record<string, string>;
export function readUserEnv(file: string): Record<string, string>;
export function startUrl(p: AppPaths, webPort: string): string;
export function edgeCandidates(env?: Env): string[];
export function edgeArgs(url: string, p: AppPaths): string[];
export function ensureLinks(appDir?: string, log?: (s: string) => void): { made: number; failed: number };
