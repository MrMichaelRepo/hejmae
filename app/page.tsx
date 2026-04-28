export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 md:px-12 py-6">
        <span className="font-sans text-[13px] font-bold uppercase tracking-[0.22em] text-hm-text">
          hejmae
        </span>
        <a
          href="mailto:hello@hejmae.com"
          className="font-sans text-[12px] uppercase tracking-[0.18em] text-hm-nav hover:text-hm-text transition-colors"
        >
          Contact
        </a>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1
          className="font-serif text-[clamp(2.4rem,6vw,5rem)] font-normal leading-[1.05] tracking-[-0.01em] opacity-0 animate-fade-up"
          style={{ animationDelay: '0.3s', animationFillMode: 'forwards' }}
        >
          hejmae
        </h1>

        <p
          className="mt-6 max-w-md font-garamond text-[clamp(1rem,2vw,1.2rem)] leading-relaxed text-hm-nav opacity-0 animate-fade-up"
          style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}
        >
          Project management, bookkeeping, and purchase tracking
          — designed for interior designers.
        </p>

        <div
          className="mt-10 opacity-0 animate-fade-up"
          style={{ animationDelay: '0.9s', animationFillMode: 'forwards' }}
        >
          <a
            href="mailto:hello@hejmae.com"
            className="inline-block font-sans text-[12px] uppercase tracking-[0.2em] border border-hm-text/20 rounded-full px-8 py-3 text-hm-text hover:bg-hm-text hover:text-bg transition-all duration-300"
          >
            Get in touch
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-8 md:px-12 py-8 text-center">
        <p className="font-sans text-[11px] uppercase tracking-[0.18em] text-hm-nav/60">
          &copy; {new Date().getFullYear()} hejmae
        </p>
      </footer>
    </main>
  )
}
