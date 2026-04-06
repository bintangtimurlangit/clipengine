import type { NextConfig } from "next";

/** Browser calls use `src/app/api-engine/[...path]/route.ts` to proxy to FastAPI with full body forwarding. */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
