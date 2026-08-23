import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

export const ENTER_ARENA_EVENT = 'ipl-enter-arena';

export function handleEnterArena() {
  if (localStorage.getItem('ipl_arena_entered') === '1') {
    document.dispatchEvent(new CustomEvent(ENTER_ARENA_EVENT));
    return;
  }
  localStorage.setItem('ipl_arena_entered', '1');
  document.dispatchEvent(new CustomEvent(ENTER_ARENA_EVENT));
}

export function ScrollReveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal ${visible ? 'lp-reveal--visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-faq-v2 rounded-2xl overflow-hidden" data-open={open}>
      <button
        type="button"
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="lp-display font-semibold text-white text-sm md:text-base">{q}</span>
        <span
          className={`shrink-0 w-8 h-8 rounded-full border border-turf/30 flex items-center justify-center text-turf text-lg transition-transform duration-300 ${open ? 'rotate-45 bg-turf/10' : ''}`}
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-slate-400 text-sm leading-relaxed border-t border-white/5 pt-3">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function HeroTile() {
  return (
    <section className="relative pt-3 md:pt-32 pb-8 px-4 min-h-screen flex flex-col justify-start md:justify-center items-center overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-3xl opacity-30 pointer-events-none" />
      <div className="relative z-20 glass p-8 md:p-12 max-w-4xl w-full text-center mt-8 md:mt-0 lp-hero-tile">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-bold mb-8">
          <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
          VERSION 1.0
        </div>
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-tight mb-6">
          THE ULTIMATE <br />
          <span className="text-gradient">CRICKET AUCTION</span>
        </h1>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            type="button"
            id="enterBtn"
            onClick={handleEnterArena}
            className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all flex items-center gap-2"
          >
            <span>⚡</span> ENTER ARENA
          </button>
          <Link
            to="/how-it-works"
            className="px-8 py-4 bg-transparent border border-white/10 rounded-xl font-bold text-white hover:bg-white/5 hover:-translate-y-1 transition-all inline-flex items-center justify-center"
          >
            VIEW RULES
          </Link>
        </div>
      </div>
      <div className="mt-5 md:mt-12 flex gap-4 text-slate-500 animate-bounce relative z-20">
        <span className="text-2xl">⌄</span>
      </div>
    </section>
  );
}
