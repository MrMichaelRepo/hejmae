/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img and pdfjs-dist are ESM-only and break webpack's CJS interop
  // when bundled for the server runtime ("Object.defineProperty called on
  // non-object" at import time). sharp and @napi-rs/canvas ship native
  // binaries that shouldn't go through webpack either. Tell Next.js to
  // require() these at runtime.
  //
  // @napi-rs/canvas is pdfjs-dist's optional canvas backend. Pinning it as
  // a real dependency (in package.json) ensures Vercel's Linux build picks
  // the correct prebuilt binary; without it, optional-dep install can fail
  // silently and PDF rasterization throws at runtime.
  serverExternalPackages: [
    'pdf-to-img',
    'pdfjs-dist',
    '@napi-rs/canvas',
    'sharp',
    '@react-pdf/renderer',
  ],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/**' },
    ],
  },
  async headers() {
    // Notes per directive:
    //   - 'unsafe-inline' on script-src is required by Next.js's hydration
    //     payload until we adopt nonce-based scripts.
    //   - 'unsafe-eval' is required by Stripe.js.
    //   - 'unsafe-inline' on style-src is required by Tailwind/Next inline
    //     style attributes; nonce-style isn't worth the complexity here.
    //   - frame-src allows Stripe Elements + Clerk's hosted screens.
    //   - img-src 'data:' covers icon-as-data-URL patterns.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.clerk.accounts.dev https://*.clerk.com https://clerk.hejmae.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https://*.supabase.co https://img.clerk.com https://*.clerk.com https://*.stripe.com",
      "connect-src 'self' https://*.supabase.co https://*.clerk.accounts.dev https://*.clerk.com https://clerk.hejmae.com https://api.stripe.com https://*.ingest.sentry.io",
      "frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com https://*.clerk.accounts.dev https://clerk.hejmae.com https://accounts.hejmae.com https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.clerk.accounts.dev https://clerk.hejmae.com https://accounts.hejmae.com",
      "frame-ancestors 'none'",
    ].join('; ')

    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
