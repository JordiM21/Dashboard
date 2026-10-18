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
  // v1 pages folded into v2 modules — keep old bookmarks and home-screen icons working.
  async redirects() {
    return [
      { source: "/overview", destination: "/today", permanent: false },
      { source: "/students", destination: "/academy", permanent: false },
      { source: "/teaching", destination: "/academy?tab=curriculum", permanent: false },
      { source: "/social", destination: "/today", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["@phosphor-icons/react", "react-markdown"]
  }
};

export default nextConfig;
