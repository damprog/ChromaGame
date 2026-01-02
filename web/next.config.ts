import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  // Add empty turbopack config to silence the warning
  // We use webpack config for WASM file handling
  turbopack: {},
  
  webpack: (config, { isServer }) => {
    // Ignore WASM files during bundling - they should be loaded at runtime
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
    });

    // Prevent Next.js from trying to bundle WASM JS files
    // These files use import.meta.url which Next.js can't resolve during build
    if (!isServer) {
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^\/wasm\/engine_wasm\.js$/,
        })
      );
    }

    return config;
  },
};

export default nextConfig;
