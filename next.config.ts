import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Appended to the AutoPitch worklet URL so a phone (Safari/PWA) can't keep
    // running an old copy of the processor after a deploy.
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA ?? String(Date.now()),
  },
};

export default nextConfig;
