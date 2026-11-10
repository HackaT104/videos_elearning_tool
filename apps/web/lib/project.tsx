"use client";
import { createContext, useContext } from "react";

export type Project = {
  id: string;
  name: string;
  course: string;
  levels: string[];
  settings: { style: string; engine: "hyperframes" | "remotion"; provider: "cit" | "edge" | "zerotts"; aiDesign: boolean; aiVision: boolean; hfRenderer: string; styleConfirmed?: boolean; font?: string; skill?: string; cartoon?: { enabled: boolean; clawd?: boolean; quality?: "nhe" | "day-du" }; cit?: { temperature?: number; seed?: number | null; useDict?: boolean }; exportDir?: string; lastExport?: { dir: string; at: string; files: number } };
  files: { id: string; name: string; level: string; kind: string; summary: any; created_at: string }[];
  warnings: string[];
  out: string;
};
export type VideoSum = {
  key: string; level: string; title: string; include: boolean; existing: boolean; status: string; approved: boolean; scenes: number;
  scriptSeconds: number; seconds: number; estimated: boolean; engine: string; style: string; font?: string; skill?: string | null;
  voice: { provider: string; voiceId: string; speed: number; temperature?: number; seed?: number | null; useDict?: boolean };
  pace: { lead: number; gap: number; tail: number }; aiWritten: boolean; qaOk: boolean | null; rendered: boolean; assumptions: number;
  job: { id: number; kind: string; status: string; step: string | null; progress: number; message: string | null; error: string | null } | null;
};

export const ProjectCtx = createContext<{ project: Project | null; reload: () => void }>({ project: null, reload: () => {} });
export const useProject = () => useContext(ProjectCtx);
