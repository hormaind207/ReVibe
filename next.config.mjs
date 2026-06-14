import withPWA from '@ducanh2912/next-pwa'

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
  },
  turbopack: {},
}

export default withPWA({
  dest: 'public',
  cacheOnFrontEndNav: false,
  aggressiveFrontEndNavCaching: false,
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === 'development',
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/www\.googleapis\.com\/drive\//,
        handler: 'NetworkOnly',
      },
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\//,
        handler: 'NetworkOnly',
      },
    ],
  },
})(nextConfig)
