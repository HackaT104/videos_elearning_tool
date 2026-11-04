// Điểm vào stdio của máy chủ MCP cho Claude Desktop: node apps/mcp/dist/cvs-mcp.mjs (bản dựng) hoặc tsx apps/mcp/src/index.ts.
// stdout là kênh giao thức – mọi nhật ký ra stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

await createServer().connect(new StdioServerTransport());
console.error("course-video-studio MCP: sẵn sàng (CVS_API =", process.env.CVS_API ?? "http://127.0.0.1:3001/api", ")");
