import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/forge/create",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
