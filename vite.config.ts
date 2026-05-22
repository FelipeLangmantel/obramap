import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const publicEnv = {
    VITE_SUPABASE_URL:
      env.VITE_SUPABASE_URL ||
      process.env.VITE_SUPABASE_URL ||
      "",
    VITE_SUPABASE_PUBLISHABLE_KEY:
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "",
    VITE_SUPABASE_PROJECT_ID:
      env.VITE_SUPABASE_PROJECT_ID ||
      process.env.VITE_SUPABASE_PROJECT_ID ||
      "",
  };

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicEnv.VITE_SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(publicEnv.VITE_SUPABASE_PROJECT_ID),
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
