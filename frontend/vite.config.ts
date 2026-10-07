import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 部署到子目录时设置 VITE_BASE_PATH=/agent-escrow/ （与姊妹项目 /agent-trust/ 同模式）
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
});
