/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
    {
      protocol: 'https',
      hostname: 'drive.google.com',
    },
  ],
    unoptimized: true
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "react-markdown"]
  }
};

export default nextConfig;
