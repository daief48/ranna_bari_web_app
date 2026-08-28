import type { NextConfig } from 'next';

const config: NextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  typedRoutes: false,
};

export default config;
