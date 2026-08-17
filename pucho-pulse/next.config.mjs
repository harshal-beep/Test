/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pg is a native-ish driver: keep it out of the bundler and require it at runtime.
  serverExternalPackages: ['pg'],
  experimental: { serverComponentsExternalPackages: ['pg'] },
};
export default nextConfig;
