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
  ],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
