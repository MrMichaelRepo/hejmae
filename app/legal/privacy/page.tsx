import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How hejmae collects, uses, and protects the data that interior design studios entrust to it.',
}

const EFFECTIVE_DATE = '2026-05-19'
const CONTACT_EMAIL = 'mikeschickling@gmail.com'

export default function PrivacyPage() {
  return (
    <article className="font-garamond text-ink leading-[1.7]">
      <header className="mb-12 pb-8 border-b border-line">
        <div className="font-sans text-[10px] uppercase tracking-[0.26em] text-ink-muted mb-4">
          Legal
        </div>
        <h1 className="font-serif text-[clamp(2rem,4vw,3rem)] leading-[1.05] tracking-[-0.015em] mb-4">
          Privacy Policy
        </h1>
        <div className="font-sans text-[11px] uppercase tracking-[0.22em] text-ink-subtle">
          Effective {EFFECTIVE_DATE}
        </div>
      </header>

      <Lede>
        hejmae is studio software for interior designers — project management,
        sourcing, proposals, purchase orders, invoicing, time tracking, and
        accounting. This page describes what data hejmae collects, how we use
        it, and the third-party services we use to deliver the product. It is
        written to be read end-to-end. If anything is unclear, write to{' '}
        <Email>{CONTACT_EMAIL}</Email>.
      </Lede>

      <Section title="Who we are">
        <p>
          hejmae is operated by Emilia Studio LLC, a California limited
          liability company. Contact: <Email>{CONTACT_EMAIL}</Email>. When this
          policy says &ldquo;we&rdquo; or &ldquo;us,&rdquo; it means Emilia
          Studio LLC, operating hejmae.
        </p>
      </Section>

      <Section title="What we collect">
        <SubH>1. Account information</SubH>
        <p>
          When you create a hejmae account (via{' '}
          <a href="https://hejmae.com/sign-up">hejmae.com/sign-up</a>), we
          collect your email address, name, and the studio name you provide.
          Authentication is handled by Clerk; sign-in events and email
          verification records are stored by Clerk on our behalf.
        </p>
        <SubH>2. Studio data you enter</SubH>
        <p>
          hejmae stores whatever you put into it. That includes:
        </p>
        <Bullets>
          <li>
            Clients — name, email, phone, address, notes. Entered by you about
            the people you do work for.
          </li>
          <li>
            Projects — names, locations, budgets, notes, status. Linked
            optionally to a client.
          </li>
          <li>
            Vendors — trade-account details, contact information, payment
            terms, shipping notes. For 1099-eligible vendors, also legal name,
            address, and tax ID (encrypted at rest; only the last four digits
            are shown to you after save).
          </li>
          <li>
            Items, clippings, and catalog products — product names, brands,
            prices, descriptions, source URLs, and product images.
          </li>
          <li>
            Floor plans you upload — images of physical floor plans, optionally
            auto-cropped and straightened.
          </li>
          <li>
            Purchase orders, proposals, and invoices — line items, prices, and
            totals built from your catalog data.
          </li>
          <li>
            Time entries — durations, optional notes, billable status, hourly
            rates.
          </li>
          <li>
            Financial records — expenses, mileage logs, ledger entries,
            estimated taxes.
          </li>
        </Bullets>
        <SubH>3. Clippings from the hejmae Clipper extension</SubH>
        <p>
          The hejmae Clipper Chrome extension uploads the URL, page title, and
          rendered HTML (capped at 1.5 MB) of a product page when you click
          Save. We use that HTML to extract the product&rsquo;s name, brand,
          price, and image. <strong>The raw HTML is not retained</strong>{' '}
          after extraction; only the extracted product fields are stored. The
          clipper has its own short-form privacy policy at{' '}
          <a href="/legal/clipper-privacy">/legal/clipper-privacy</a>.
        </p>
        <SubH>4. Payment information</SubH>
        <p>
          hejmae uses <strong>Stripe Connect</strong> — payments your clients
          make flow directly to your own Stripe account, not through hejmae.
          We see only the metadata Stripe shares with the connected
          application: payment status, amount, currency, and the linked
          invoice. We never see card numbers, bank credentials, or full
          customer payment details. Stripe takes its own fee; we take a 0.1%
          platform fee on processed volume.
        </p>
        <SubH>5. Usage and operational data</SubH>
        <p>
          Like any web application, our hosting provider records standard
          HTTP request metadata (timestamp, URL path, response status, IP
          address) for operational and security purposes. We do not use
          tracking pixels, advertising cookies, or third-party analytics
          libraries that profile users across sites.
        </p>
      </Section>

      <Section title="How we use the data">
        <p>We use the data you and your collaborators enter to:</p>
        <Bullets>
          <li>Render the dashboards you signed in to use.</li>
          <li>
            Extract structured product information from clippings (see AI
            sub-processors below).
          </li>
          <li>
            Generate proposals, purchase orders, and invoices as PDFs and
            send them to clients or vendors via email when you ask us to.
          </li>
          <li>
            Process client payments through your connected Stripe account.
          </li>
          <li>
            Operate, secure, and improve the service — debug errors, monitor
            for abuse, fix bugs.
          </li>
          <li>Communicate with you about your account when necessary.</li>
        </Bullets>
        <p>
          We do not sell user data. We do not use your data to train AI
          models, and our AI sub-processors are bound by their commercial
          terms not to train on it either (see below).
        </p>
      </Section>

      <Section title="Sub-processors">
        <p>
          A sub-processor is a third-party service that handles data on our
          behalf. Each one below is bound by contract to use the data only to
          deliver its service to hejmae.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Service</Th>
              <Th>Purpose</Th>
              <Th>What it receives</Th>
            </tr>
          </thead>
          <tbody>
            <Row
              name="Supabase"
              purpose="Primary database and file storage (Postgres + object storage)."
              receives="Everything you save in hejmae: account info, studio data, clipping metadata, floor plan and product images."
            />
            <Row
              name="Vercel"
              purpose="Application hosting."
              receives="Standard HTTP request metadata. Request bodies are not retained in function logs."
            />
            <Row
              name="Clerk"
              purpose="Authentication and session management."
              receives="Your email, name, and sign-in events. Does not see studio content."
            />
            <Row
              name="Anthropic"
              purpose="Verify product fields extracted from clipped pages (Claude Haiku 4.5)."
              receives="A cleaned HTML excerpt of the clipped page (≤ ~120 KB; scripts, styles, and navigation removed) plus the page URL. Not used to train models; deleted within 30 days."
            />
            <Row
              name="OpenAI"
              purpose="Generate text embeddings for catalog search and (when you upload an image) a vision description of the image."
              receives="Assembled product summary text (name, brand, item type, style, short description). For image search: the image you upload. Not used to train models; deleted within 30 days."
            />
            <Row
              name="Stripe"
              purpose="Process client payments via Stripe Connect, payouts go directly to your account."
              receives="Invoice and payment metadata. Full card and bank details stay with Stripe; we never see them."
            />
            <Row
              name="Resend"
              purpose="Deliver transactional email (invoice/proposal sends, sign-in magic links, system notifications)."
              receives="Recipient email address, subject, and message body of emails you ask us to send."
            />
          </tbody>
        </Table>
      </Section>

      <Section title="Studio teams and shared access">
        <p>
          If you invite collaborators to your studio, they can see the data
          inside the studio according to the role you grant them (owner,
          admin, or member). Roles and per-permission flags are configurable
          under <strong>Settings &rarr; Team</strong>. When you remove a
          teammate, their access ends immediately, but their prior activity
          (time entries, clippings they created) remains attributed to them
          in the studio history so reports stay accurate.
        </p>
        <p>
          The hejmae <strong>catalog</strong> is the one piece of data shared
          across studios: when any designer clips a product, the product
          itself (name, brand, price, image, source URL) is added to a
          platform-wide catalog so the next designer to clip the same
          product doesn&rsquo;t pay the AI extraction cost again. The
          catalog is <strong>anonymized</strong> — it does not reveal which
          studio first clipped a product or who else has used it.
        </p>
      </Section>

      <Section title="Where data is stored">
        <p>
          hejmae&rsquo;s primary data is stored in Supabase&rsquo;s US-region
          infrastructure. Vercel serves the application from edge locations
          worldwide. Email delivery (Resend) and authentication (Clerk) run
          in the US. AI sub-processors (Anthropic and OpenAI) process
          requests in the US. If you are outside the US, your data will be
          transferred to and processed in the US.
        </p>
      </Section>

      <Section title="Retention and deletion">
        <p>
          We retain studio data for as long as your account is open. You can
          delete any record from inside the application:
        </p>
        <Bullets>
          <li>
            Clippings, items, projects, clients, vendors, time entries,
            expenses, invoices, and POs each have a delete action in the
            dashboard. Most deletions are soft (recoverable within a short
            window); some, like clippings, are hard-deleted after a brief
            grace period.
          </li>
          <li>
            Floor plan and product image files are removed from storage when
            their parent record is hard-deleted.
          </li>
          <li>
            To delete your entire account and all studio data, email{' '}
            <Email>{CONTACT_EMAIL}</Email>. We will confirm and complete
            account deletion within 30 days. Backups containing your data
            roll off our retention window (currently 30 days) after that.
          </li>
        </Bullets>
        <p>
          We may retain a minimal record of the deletion request itself
          (timestamp, account identifier) for legal and audit purposes.
        </p>
      </Section>

      <Section title="Security">
        <p>
          All traffic to hejmae.com runs over TLS. Application secrets and
          API keys are stored in Vercel&rsquo;s encrypted environment
          variable store, not in source control. Tax IDs entered for 1099
          vendors are encrypted at rest before they hit the database; only
          the last four digits are displayed back to you.
        </p>
        <p>
          No system is perfectly secure. If you believe you have found a
          vulnerability, please email <Email>{CONTACT_EMAIL}</Email> with the
          details. We will respond within five business days.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can view, export, and delete data inside the application at
          any time. If you are in a jurisdiction that grants formal data
          subject rights (GDPR, UK GDPR, CCPA, etc.), you can additionally
          request:
        </p>
        <Bullets>
          <li>A copy of the personal data we hold about you.</li>
          <li>Correction of any inaccurate personal data.</li>
          <li>Deletion of your account and all associated data.</li>
          <li>
            A complaint to your local supervisory authority. We will
            cooperate with any lawful inquiry.
          </li>
        </Bullets>
        <p>
          Send any of these requests to <Email>{CONTACT_EMAIL}</Email>. We
          may need to verify your identity before acting.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          hejmae uses a small number of strictly-necessary cookies to keep
          you signed in (managed by Clerk) and to remember your in-app
          preferences. We do not set advertising cookies or share cookies
          with third-party advertising networks.
        </p>
      </Section>

      <Section title="Children">
        <p>
          hejmae is built for professional interior designers and is not
          directed at children under 13. We do not knowingly collect
          information from children.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          If this policy changes materially, we will update the{' '}
          <strong>Effective</strong> date at the top of the page and notify
          studio owners by email. The current version is always available at
          this URL.
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
// Atoms — kept inline because this is the only page that uses them.
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
}: {
  name: string
  purpose: string
  receives: string
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
    </tr>
  )
}
