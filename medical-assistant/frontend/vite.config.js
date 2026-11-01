import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    proxy: { "/api": process.env.MEDICAL_ASSISTANT_API_PROXY || "http://localhost:8010" },
  },
});
