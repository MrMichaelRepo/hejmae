/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-to-img and pdfjs-dist are ESM-only and break webpack's CJS interop
  // when bundled for the server runtime ("Object.defineProperty called on
  // non-object" at import time). sharp ships native binaries that shouldn't
  // go through webpack either. Tell Next.js to require() these at runtime.
  serverExternalPackages: ['pdf-to-img', 'pdfjs-dist', 'sharp'],
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
