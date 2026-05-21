import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'hejmae Clipper — Privacy Policy',
  description:
    'How the hejmae Clipper Chrome extension collects and handles data. Single-purpose, no third-party trackers, full sub-processor disclosure.',
}

const EFFECTIVE_DATE = '2026-05-19'
const CONTACT_EMAIL = 'mikeschickling@gmail.com'

export default function ClipperPrivacyPage() {
  return (
    <article className="font-garamond text-ink leading-[1.7]">
      <header className="mb-12 pb-8 border-b border-line">
        <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-ink-muted mb-4">
          Legal · Chrome Extension
        </div>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.015em] mb-4">
          hejmae Clipper — Privacy Policy
        </h1>
        <div className="font-sans text-[11px] uppercase tracking-[0.22em] text-ink-subtle">
          Effective {EFFECTIVE_DATE}
        </div>
      </header>

      <Lede>
        This policy describes what the <strong>hejmae Clipper</strong> Chrome
        extension does with information on your device and on hejmae&rsquo;s
        servers. It is written to be read end-to-end. If anything below is
        unclear, write to <Email>{CONTACT_EMAIL}</Email>. The main hejmae
        Studio privacy policy is at <a href="/legal/privacy">/legal/privacy</a>.
      </Lede>

      <Section title="TL;DR">
        <Bullets>
          <li>The extension does one thing: save a product you&rsquo;re looking at to your hejmae account.</li>
          <li>
            <strong>The extension itself transmits data only to hejmae.com — your own account.</strong>{' '}
            No analytics, no third-party trackers, no advertising.
          </li>
          <li>
            When you click <strong>Save</strong>, the extension uploads the
            current tab&rsquo;s URL, title, and the page&rsquo;s rendered HTML
            (up to 1.5 MB) so hejmae can extract the product name, brand,
            price, and image.{' '}
            <strong>
              Raw HTML is used for that extraction and is not retained in the
              hejmae database afterwards.
            </strong>
          </li>
          <li>
            To turn the page into structured product data, the hejmae server
            sends a cleaned excerpt of the HTML (scripts/styles/navigation
            removed, capped at ~120 KB) to{' '}
            <strong>Anthropic&rsquo;s Claude API</strong> as a sub-processor,
            and an assembled text summary of each saved product (name, brand,
            type, style, short description) to{' '}
            <strong>OpenAI&rsquo;s embedding API</strong> for catalog search.
            Both vendors are bound by their commercial API terms not to train
            on this data and to delete it within 30 days. The full
            sub-processor list is below.
          </li>
          <li>
            The extension reads your hejmae sign-in cookie so it knows
            you&rsquo;re logged in. It cannot read cookies from any other
            site.
          </li>
          <li>
            A small amount of data (your profile, project list, and last-used
            project) is cached on your own device in Chrome&rsquo;s local
            storage for up to five minutes, or until you sign out.
          </li>
        </Bullets>
      </Section>

      <Section title="What the extension does">
        <p>
          The hejmae Clipper is a Chrome extension for interior designers who
          already have a hejmae account. Its single function is: when
          you&rsquo;re browsing a product page (a sofa, a sconce, a rug), you
          can click the extension and save that product to your hejmae
          library, optionally tagged to a specific project. The extension
          does not run unless you click it.
        </p>
      </Section>

      <Section title="Information we process">
        <SubH>1. Active tab metadata — read only when you open the popup</SubH>
        <p>
          When you click the hejmae Clipper icon, the extension reads the
          URL, page title, and favicon of the tab you&rsquo;re currently
          looking at. This happens because the extension was designed for you
          to click <em>Save</em> on that page. It does <strong>not</strong>{' '}
          read tabs you haven&rsquo;t visited or that you closed.
        </p>

        <SubH>2. Rendered HTML — uploaded only when you click &ldquo;Save&rdquo;</SubH>
        <p>
          When you press the <strong>Save to Clippings</strong> button, the
          extension reads the rendered HTML of the active tab (
          <code className="font-mono text-[0.9em]">
            document.documentElement.outerHTML
          </code>
          ), caps it at 1.5 MB, and posts it to{' '}
          <code className="font-mono text-[0.9em]">
            https://hejmae.com/api/clippings/clip
          </code>{' '}
          together with the URL and title. The server uses this HTML to
          extract the product&rsquo;s name, brand, price, and image. It is the
          only way to capture products from modern shopping sites that load
          their content with JavaScript.
        </p>
        <p>
          <strong>What this HTML may contain.</strong> The rendered HTML is
          whatever the page contains at the moment you click Save. On a
          shopping site this is almost always product information. On a
          logged-in page, it could include information visible to you in that
          tab — for example, your name in an account menu, or items in a
          cart.{' '}
          <strong>
            Only click Save on pages you&rsquo;re comfortable sharing with
            your own hejmae account.
          </strong>{' '}
          The extension does not capture HTML at any other time.
        </p>
        <p>
          <strong>How the server uses the HTML.</strong> The hejmae server
          parses the upload, extracts the product fields, and discards the
          raw HTML once extraction completes. The extracted product fields
          (name, brand, price, image URL) are stored as a clipping in your
          hejmae account.
        </p>

        <SubH>3. Authentication cookie — read only from hejmae.com</SubH>
        <p>
          The extension reads the{' '}
          <code className="font-mono text-[0.9em]">__session</code> cookie
          that Clerk sets on <code className="font-mono text-[0.9em]">hejmae.com</code>{' '}
          and{' '}
          <code className="font-mono text-[0.9em]">www.hejmae.com</code> after
          you sign in. This is how the extension knows whether you&rsquo;re
          logged in. The extension does not read cookies from any other site.
          The cookie itself is never sent to anything outside hejmae.com — it
          is passed automatically by Chrome on requests to the hejmae API.
        </p>

        <SubH>4. Profile and project list — cached on your device</SubH>
        <p>After you sign in, the extension fetches and caches:</p>
        <Bullets>
          <li>Your hejmae profile: user id, email, name, studio logo URL, studio id, role</li>
          <li>Your active project list: project ids, names, statuses</li>
          <li>The id of the last project you tagged a clipping with</li>
        </Bullets>
        <p>
          This cache lives in{' '}
          <code className="font-mono text-[0.9em]">chrome.storage.local</code>{' '}
          on your own computer for up to five minutes (the profile and
          project list refresh automatically after that). The last-used
          project id persists until you sign out. When you sign out of hejmae
          on the web, the extension automatically clears its profile cache.
        </p>
        <p>
          <code className="font-mono text-[0.9em]">chrome.storage.local</code>{' '}
          is <strong>not encrypted</strong> — it is plaintext inside your
          Chrome profile directory. On a shared machine, another user of the
          same Chrome profile could read it; another extension cannot.
        </p>
      </Section>

      <Section title="Where data goes">
        <SubH>The extension itself</SubH>
        <p>
          The extension communicates with exactly one server:{' '}
          <strong>hejmae.com</strong> (and its subdomains, e.g.{' '}
          <code className="font-mono text-[0.9em]">www.hejmae.com</code>).
          Every API call the extension makes is sent to that origin.
        </p>
        <p>The extension does <strong>not</strong> contact:</p>
        <Bullets>
          <li>Any analytics service (no Google Analytics, no PostHog, no Mixpanel, etc.)</li>
          <li>Any error-reporting service (no Sentry)</li>
          <li>Any advertising network</li>
          <li>Any third-party CDN or telemetry provider</li>
        </Bullets>
        <p>
          This is enforced both by the extension&rsquo;s code and by its
          manifest, which only requests permission to talk to hejmae.com
          domains.
        </p>

        <SubH>What the hejmae server does with your clipping</SubH>
        <p>
          Once the rendered HTML arrives at hejmae.com, the server forwards
          portions of the data to a small number of trusted sub-processors as
          part of normal product extraction and catalog search. The full
          list is in the <strong>Sub-processors</strong> section below.
          Notably:
        </p>
        <Bullets>
          <li>
            A cleaned HTML excerpt (scripts, styles, navigation stripped;
            capped at ~120 KB) is sent to <strong>Anthropic&rsquo;s Claude API</strong>{' '}
            so the model can verify the extracted product name, brand, price,
            image, and style.
          </li>
          <li>
            The assembled product summary (name, brand, item type, style, and
            the short product description) — <strong>not the raw HTML</strong>{' '}
            — is sent to <strong>OpenAI&rsquo;s embedding API</strong> so your
            catalog can be searched.
          </li>
        </Bullets>
      </Section>

      <Section title="Sub-processors">
        <p>
          A sub-processor is a third-party service that handles user data on
          hejmae&rsquo;s behalf. We use the following sub-processors. Each
          is bound by contract to use your data only to deliver their service
          to hejmae, not for any independent purpose.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Sub-processor</Th>
              <Th>Purpose</Th>
              <Th>What it receives</Th>
              <Th>Retention</Th>
            </tr>
          </thead>
          <tbody>
            <Row
              name="Anthropic"
              purpose="Verify extracted product fields (Claude Haiku) from the page HTML."
              receives="Cleaned HTML excerpt (≤ ~120 KB; scripts/styles/nav removed) + the URL."
              retention="Up to 30 days for abuse monitoring; not used for training."
            />
            <Row
              name="OpenAI (embeddings)"
              purpose="Generate a search vector so your catalog is searchable by text."
              receives="Short text summary: name, brand, vendor, item type, style, and ~800 chars of description. Not the raw HTML."
              retention="Up to 30 days for abuse monitoring; not used for training."
            />
            <Row
              name="OpenAI (vision)"
              purpose='Power the optional "search by image" feature in the hejmae catalog (web app only).'
              receives="An image you explicitly upload to the catalog search box. The clipper extension does not trigger this."
              retention="Up to 30 days for abuse monitoring; not used for training."
            />
            <Row
              name="Supabase"
              purpose="Primary database and image storage for your hejmae account."
              receives="All clipping metadata and downloaded product images."
              retention="Until you delete the clipping or your account."
            />
            <Row
              name="Vercel"
              purpose="Hosting platform for hejmae.com."
              receives="Standard HTTP request metadata. Request bodies (including the HTML upload) are not retained in Vercel function logs."
              retention="Per Vercel's standard retention."
            />
            <Row
              name="Clerk"
              purpose="User authentication."
              receives="Your email, name, and sign-in events. Sees no clipping content."
              retention="Until you delete your account."
            />
          </tbody>
        </Table>
        <p>
          We do not share data with any other third party. We do not sell
          user data.
        </p>
      </Section>

      <Section title="What we do not do">
        <Bullets>
          <li>We do not read or modify pages you visit unless you click Save.</li>
          <li>We do not inject content scripts into arbitrary websites.</li>
          <li>We do not track your browsing history.</li>
          <li>We do not read clipboard contents, microphone, camera, geolocation, or any device sensor.</li>
          <li>We do not read cookies from any site other than hejmae.com.</li>
          <li>We do not sell user data.</li>
          <li>
            We do not load remote code at runtime. The extension&rsquo;s
            JavaScript is the JavaScript reviewed by the Chrome Web Store at
            publish time.
          </li>
        </Bullets>
      </Section>

      <Section title="Permissions and why they exist">
        <Table>
          <thead>
            <tr>
              <Th>Chrome permission</Th>
              <Th>Why the extension needs it</Th>
            </tr>
          </thead>
          <tbody>
            <PermRow
              name="activeTab"
              why="Read the URL and title of the tab you're on at the moment you click the extension, so we know which product to save. Scoped to your click — not to any other tab."
            />
            <PermRow
              name="scripting"
              why="Run a single small script in the active tab on your click to capture the rendered HTML so the server can extract product fields. Necessary for JavaScript-rendered shopping sites."
            />
            <PermRow
              name="cookies"
              why="Read the __session cookie from hejmae.com to determine whether you're signed in. We only read this single cookie, only from hejmae domains."
            />
            <PermRow
              name="storage"
              why="Cache your profile and project list locally for up to five minutes so the popup opens instantly."
            />
            <PermRow
              name="host_permissions: hejmae.com"
              why="Send authenticated requests to your hejmae account, and read the sign-in cookie from the hejmae domains."
            />
          </tbody>
        </Table>
      </Section>

      <Section title="Server-side data retention">
        <p>
          Once a clipping is saved, the underlying product data lives in your
          hejmae account under the normal account terms (see the main hejmae
          privacy policy at <a href="/legal/privacy">/legal/privacy</a>). You
          can delete clippings at any time from{' '}
          <a href="/dashboard/clippings">/dashboard/clippings</a>. Deleting a
          clipping removes it from your account.
        </p>
        <p>
          The raw HTML uploaded when you click Save is consumed by the
          server&rsquo;s extraction pipeline and is not persisted to the
          hejmae database. Standard server logs may retain request metadata
          (timestamp, URL, response status) for operational debugging; logs
          do <strong>not</strong> include the raw HTML body of the upload.
        </p>
      </Section>

      <Section title="Your rights">
        <p>If you have a hejmae account, you can:</p>
        <Bullets>
          <li>
            View every clipping in your account at{' '}
            <a href="/dashboard/clippings">/dashboard/clippings</a>.
          </li>
          <li>Delete any clipping.</li>
          <li>
            Delete your entire hejmae account by contacting{' '}
            <Email>{CONTACT_EMAIL}</Email>. Deletion removes the clippings
            stored on the server. The extension&rsquo;s local cache is
            cleared automatically when you sign out.
          </li>
        </Bullets>
        <p>
          If you&rsquo;re in a jurisdiction that grants you formal
          data-subject rights (GDPR, CCPA, etc.), you can exercise them by
          emailing the contact address above.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The hejmae Clipper is a tool for professional interior designers
          and is not directed at children under 13. We do not knowingly
          collect information from children.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If this policy changes materially, we will update the{' '}
          <strong>Effective</strong> date at the top and post a notice in the
          Chrome Web Store listing release notes. The latest policy is always
          available at this URL.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions, deletion requests, or security disclosures:{' '}
          <Email>{CONTACT_EMAIL}</Email>.
        </p>
      </Section>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Atoms — duplicated from /legal/privacy so each page is self-contained.
// If a third legal page appears, extract these into components/ui/legal.tsx.
// ---------------------------------------------------------------------------

function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-garamond text-[1.15rem] leading-[1.7] text-ink mb-10">
      {children}
    </p>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-12">
      <h2 className="font-serif text-[1.55rem] leading-[1.15] tracking-[-0.01em] mb-5">
        {title}
      </h2>
      <div className="space-y-4 font-garamond text-[1.02rem] leading-[1.75] text-ink">
        {children}
      </div>
    </section>
  )
}

function SubH({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-sans text-[11px] uppercase tracking-[0.22em] text-ink-muted mt-6 mb-2">
      {children}
    </h3>
  )
}

function Bullets({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc pl-6 space-y-2 marker:text-ink-subtle">
      {children}
    </ul>
  )
}

function Email({ children }: { children: React.ReactNode }) {
  return (
    <a
      href={`mailto:${children}`}
      className="text-ink underline decoration-line decoration-1 underline-offset-4 hover:decoration-ink transition-colors"
    >
      {children}
    </a>
  )
}

function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 border border-line rounded overflow-hidden">
      <table className="w-full text-left border-collapse">{children}</table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="font-sans text-[10px] uppercase tracking-[0.22em] text-ink-muted px-4 py-3 border-b border-line bg-bg-elevated font-normal">
      {children}
    </th>
  )
}

function Row({
  name,
  purpose,
  receives,
  retention,
}: {
  name: string
  purpose: string
  receives: string
  retention: string
}) {
  return (
    <tr className="border-b border-line last:border-b-0 align-top">
      <td className="font-serif text-[1.05rem] px-4 py-4 whitespace-nowrap">
        {name}
      </td>
      <td className="font-garamond text-[0.98rem] leading-[1.6] px-4 py-4 text-ink-muted">
        {purpose}
      </td>
      <td className="font-garamond text-[0.98rem] leading-[1.6] px-4 py-4 text-ink-muted">
        {receives}
      </td>
      <td className="font-garamond text-[0.98rem] leading-[1.6] px-4 py-4 text-ink-muted">
        {retention}
      </td>
    </tr>
  )
}

function PermRow({ name, why }: { name: string; why: string }) {
  return (
    <tr className="border-b border-line last:border-b-0 align-top">
      <td className="font-mono text-[0.92rem] px-4 py-4 whitespace-nowrap text-ink">
        {name}
      </td>
      <td className="font-garamond text-[0.98rem] leading-[1.6] px-4 py-4 text-ink-muted">
        {why}
      </td>
    </tr>
  )
}
