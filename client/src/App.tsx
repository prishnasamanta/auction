import React, { useEffect, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { handleEnterArena } from './marketingShared';
import { HomePage, FeaturesPage, HowItWorksPage, PoolsPage, FaqPage } from './pages/MarketingPages';

declare global {
  interface Window {
    iplFirebase?: { user?: { displayName?: string; email?: string } | null; ready?: boolean };
    authGoogleLogout?: () => Promise<void>;
    authGoogleSync?: () => Promise<void>;
  }
}

function SiteShell({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [googleUser, setGoogleUser] = useState<{ name: string; email: string } | null>(null);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setScrollY(window.scrollY);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    const sync = () => {
      const u = window.iplFirebase?.user;
      setGoogleUser(u ? { name: u.displayName || '', email: u.email || '' } : null);
    };
    sync();
    document.addEventListener('ipl-auth-changed', sync);
    return () => document.removeEventListener('ipl-auth-changed', sync);
  }, []);

  const navLinks: [string, string][] = [
    ['Features', '/features'],
    ['How it works', '/how-it-works'],
    ['Pools', '/pools'],
    ['FAQ', '/faq'],
  ];

  return (
    <div className="lp-page min-h-screen bg-transparent text-slate-100 overflow-x-hidden selection:bg-turf/30">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute inset-0 bg-gradient-to-b from-pitch-900 via-pitch-950 to-black" />
        <div
          className="lp-glow-orb w-[min(90vw,520px)] h-[min(90vw,520px)] -top-32 -left-32 bg-turf/20"
          style={{ transform: `translateY(${scrollY * 0.15}px)` }}
        />
        <div
          className="lp-glow-orb w-[400px] h-[400px] top-[40%] -right-32 bg-gold/10"
          style={{ transform: `translateY(${scrollY * -0.1}px)` }}
        />
        <div className="lp-noise absolute inset-0" />
      </div>

      <div className="fixed top-0 left-0 right-0 z-50 h-9 lp-tape-v2 flex items-center overflow-hidden border-b border-turf/20 bg-pitch-900/90 backdrop-blur-md">
        <div className="lp-tape-track whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.2em] text-turf-glow/90">
          {[0, 1].map((n) => (
            <React.Fragment key={n}>
              <span className="mx-6">Live multiplayer auction</span>
              <span className="text-gold">◆</span>
              <span className="mx-6">Real-time bidding</span>
              <span className="text-gold">◆</span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <header
        className={`fixed top-9 left-0 right-0 z-40 transition-all duration-500 ${
          scrolled ? 'bg-pitch-950/85 backdrop-blur-xl border-b border-white/5 shadow-lg py-3' : 'bg-transparent py-4'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 md:px-8 flex items-center justify-between gap-4">
          <Link to="/" className="lp-display text-lg md:text-xl font-bold tracking-tight text-white">
            IPL<span className="lp-gradient-text">Auction</span>
          </Link>

          <nav className="hidden lg:flex items-center gap-8">
            {navLinks.map(([label, href]) => (
              <Link
                key={href}
                to={href}
                className={`text-xs font-semibold uppercase tracking-[0.15em] transition-colors ${
                  location.pathname === href ? 'text-turf-glow' : 'text-slate-400 hover:text-turf-glow'
                }`}
              >
                {label}
              </Link>
            ))}
            {googleUser ? (
              <button
                type="button"
                onClick={() => window.authGoogleLogout?.()}
                className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-red-300"
              >
                Log out
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleEnterArena}
              className="lp-display text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full bg-turf text-pitch-950 hover:bg-turf-glow transition-colors shadow-glow"
            >
              Play now
            </button>
          </nav>

          <button
            type="button"
            className="lg:hidden w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-white"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Menu"
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>

        {navOpen && (
          <div className="lg:hidden border-t border-white/10 bg-pitch-950/95 backdrop-blur-xl px-4 py-4 flex flex-col gap-3">
            {navLinks.map(([label, href]) => (
              <Link key={href} to={href} className="text-sm text-slate-300 py-2" onClick={() => setNavOpen(false)}>
                {label}
              </Link>
            ))}
            {googleUser ? (
              <p className="text-xs text-slate-500 truncate">{googleUser.name || googleUser.email}</p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setNavOpen(false);
                handleEnterArena();
              }}
              className="py-3 rounded-xl bg-turf text-pitch-950 font-bold"
            >
              Enter arena
            </button>
            {googleUser ? (
              <button
                type="button"
                onClick={() => {
                  setNavOpen(false);
                  window.authGoogleLogout?.();
                }}
                className="py-2 rounded-xl border border-white/10 text-slate-300 text-sm"
              >
                Log out
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNavOpen(false);
                  window.authGoogleSync?.();
                }}
                className="py-2 rounded-xl border border-white/10 text-slate-300 text-sm"
              >
                Connect Google
              </button>
            )}
          </div>
        )}
      </header>

      <main className="relative z-10">{children}</main>

      {location.pathname === '/' && (
        <>
          <section id="features" className="relative z-10 py-20 md:py-28 px-4 scroll-mt-24">
            <div className="max-w-6xl mx-auto text-center">
              <Link to="/features" className="text-turf text-sm font-bold uppercase tracking-widest hover:underline">
                Explore all features →
              </Link>
            </div>
          </section>
          <section id="faq" className="relative z-10 py-12 px-4 pb-28">
            <div className="max-w-2xl mx-auto text-center">
              <Link to="/faq" className="text-turf text-sm font-bold uppercase tracking-widest hover:underline">
                Read full FAQ →
              </Link>
            </div>
          </section>
        </>
      )}

      <footer className="app-footer" style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', zIndex: 100 }}>
        <div className="footer-content">
          <span>
            Made with <span style={{ color: '#e11d48' }}>❤️</span> by <b>PRS</b>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <SiteShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pools" element={<PoolsPage />} />
        <Route path="/faq" element={<FaqPage />} />
      </Routes>
    </SiteShell>
  );
}
