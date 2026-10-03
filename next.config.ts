import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev only: lets a second local player use http://127.0.0.1:3000 (its own
  // cookie jar) alongside localhost. Without it the dev server blocks the
  // page's /_next dev requests from that origin and the client never hydrates.
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
