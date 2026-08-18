/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pg is a native-ish driver: keep it out of the bundler and require it at
  // runtime. On Next 14 the key lives under `experimental`; it graduates to a
  // top-level `serverExternalPackages` in 15, which 14 warns about as unknown.
  experimental: { serverComponentsExternalPackages: ['pg'] },
};
export default nextConfig;
