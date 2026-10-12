/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL;

    if (!backendUrl) {
      throw new Error("BACKEND_URL is not configured.");
    }

    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl.replace(/\/+$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;