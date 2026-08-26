/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    requestInsights: true,
  },
  agentRules: false,
};

export default nextConfig;
