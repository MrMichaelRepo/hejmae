import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Designer-only paths require a Clerk session. The client portal and
// webhook endpoints are explicitly public — they are authenticated in
// other ways (magic-link tokens / Stripe + Svix signatures).
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/projects(.*)',
  '/clients(.*)',
  '/finances(.*)',
  '/settings(.*)',
  '/api/projects(.*)',
  '/api/clients(.*)',
  '/api/catalog(.*)',
  '/api/finances(.*)',
  '/api/settings(.*)',
])

const isPublicApi = createRouteMatcher([
  '/api/portal(.*)',
  '/api/webhooks(.*)',
])

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApi(req)) return
  if (isProtectedRoute(req)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
