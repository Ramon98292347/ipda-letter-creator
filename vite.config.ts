import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  const port = Number(env.VITE_PORT) || 8080;
  return {
    server: {
      host: "::",
      port,
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-react": ["react", "react-dom", "react-router-dom"],
            "vendor-query": ["@tanstack/react-query"],
            "vendor-ui": ["@radix-ui/react-dialog", "@radix-ui/react-select", "@radix-ui/react-popover", "@radix-ui/react-tabs", "@radix-ui/react-tooltip"],
            "vendor-charts": ["recharts"],
          },
        },
      },
    },
  };
});
