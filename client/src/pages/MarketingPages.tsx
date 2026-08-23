import { Link } from 'react-router-dom';
import { ScrollReveal, FaqItem, HeroTile } from '../marketingShared';

export function FeaturesPage() {
  return (
    <section className="relative z-10 py-16 md:py-24 px-4 min-h-[70vh]">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="max-w-2xl mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-turf mb-3">Platform</p>
          <h1 className="lp-display text-3xl md:text-5xl font-bold">
            Everything for a <span className="lp-gradient-text">pro auction night</span>
          </h1>
          <p className="text-slate-400 mt-4">Live bidding, purse rules, stickers, player cards, and Playing XI validation.</p>
        </ScrollReveal>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { tag: 'Live', title: 'Real-time war room', desc: 'Bids, purse, and sold tiles sync instantly.', accent: 'border-t-turf' },
            { tag: 'Smart', title: 'Purse & rules engine', desc: 'Budget caps and role minimums enforced automatically.', accent: 'border-t-gold' },
            { tag: 'Social', title: 'Stickers & chat', desc: 'React mid-auction with emoji or local sticker packs.', accent: 'border-t-emerald-400' },
            { tag: 'Cards', title: 'Player cards & XI', desc: 'Download sold cards and lock a validated XI.', accent: 'border-t-cyan-400' },
          ].map((f, i) => (
            <ScrollReveal key={f.title} delay={i * 60}>
              <article className={`lp-feature-card lp-glass-panel rounded-2xl p-6 border-t-2 ${f.accent}`}>
                <span className="text-[10px] font-bold uppercase tracking-widest text-turf/80">{f.tag}</span>
                <h2 className="lp-display text-xl font-bold text-white mt-3 mb-2">{f.title}</h2>
                <p className="text-slate-400 text-sm">{f.desc}</p>
              </article>
            </ScrollReveal>
          ))}
        </div>
        <p className="text-center mt-12">
          <Link to="/" className="text-turf hover:text-turf-glow text-sm font-semibold">← Back home</Link>
        </p>
      </div>
    </section>
  );
}

export function HowItWorksPage() {
  return (
    <section className="relative z-10 py-16 md:py-24 px-4 min-h-[70vh]">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="text-center mb-12">
          <h1 className="lp-display text-3xl md:text-5xl font-bold">How it works</h1>
          <p className="text-slate-400 mt-3">Four steps from lobby to championship squads.</p>
        </ScrollReveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { n: '01', t: 'Create or join', d: 'Host a room or enter a 5-letter code.' },
            { n: '02', t: 'Claim a team', d: 'Pick your franchise first-come.' },
            { n: '03', t: 'Bid live', d: 'Host runs the clock; you bid and chat.' },
            { n: '04', t: 'Lock Playing XI', d: 'Rules-checked XI when the hammer falls.' },
          ].map((step, i) => (
            <ScrollReveal key={step.n} delay={i * 70}>
              <div className="lp-glass-panel rounded-2xl p-6 h-full">
                <span className="text-xs font-bold text-turf">Step {step.n}</span>
                <h2 className="lp-display font-bold text-white text-lg mt-2 mb-2">{step.t}</h2>
                <p className="text-slate-400 text-sm">{step.d}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
        <p className="text-center mt-12">
          <Link to="/" className="text-turf hover:text-turf-glow text-sm font-semibold">← Back home</Link>
        </p>
      </div>
    </section>
  );
}

export function PoolsPage() {
  return (
    <section className="relative z-10 py-16 md:py-24 px-4 min-h-[70vh]">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="mb-12">
          <h1 className="lp-display text-3xl md:text-4xl font-bold">Player pools</h1>
          <p className="text-slate-400 mt-3">Draft from any era — IPL 2026, legends, mixed, or custom CSV.</p>
        </ScrollReveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { emoji: '🏆', name: 'IPL 2026', sub: 'Current season roster' },
            { emoji: '⚡', name: 'Legends', sub: 'All-time greats' },
            { emoji: '👥', name: 'Mixed', sub: 'Icons across eras' },
            { emoji: '🛠️', name: 'Custom', sub: 'Your own players' },
          ].map((pool, i) => (
            <ScrollReveal key={pool.name} delay={i * 50}>
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-pitch-800/80 to-pitch-950 p-6 text-center">
                <div className="text-4xl mb-3">{pool.emoji}</div>
                <h2 className="lp-display font-bold text-white">{pool.name}</h2>
                <p className="text-slate-500 text-xs mt-1">{pool.sub}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
        <p className="text-center mt-12">
          <Link to="/" className="text-turf hover:text-turf-glow text-sm font-semibold">← Back home</Link>
        </p>
      </div>
    </section>
  );
}

export function FaqPage() {
  const items = [
    { q: 'What is IPL Auction?', a: 'A live multiplayer cricket auction simulator — bid with friends and export cards.' },
    { q: 'How do I host?', a: 'Enter the arena, create a room, and share your 5-letter code.' },
    { q: 'Custom players?', a: 'Select the Custom pool and import your list before the auction.' },
    { q: 'Google sync?', a: 'Sign in on the lobby to save finished games and reopen summaries later.' },
  ];
  return (
    <section className="relative z-10 py-16 md:py-28 px-4 pb-36 min-h-[70vh]">
      <div className="max-w-2xl mx-auto">
        <ScrollReveal className="text-center mb-10">
          <h1 className="lp-display text-3xl md:text-4xl font-bold">FAQ</h1>
        </ScrollReveal>
        <div className="space-y-3">
          {items.map((item, i) => (
            <ScrollReveal key={item.q} delay={i * 40}>
              <FaqItem q={item.q} a={item.a} />
            </ScrollReveal>
          ))}
        </div>
        <p className="text-center mt-10">
          <Link to="/" className="text-turf hover:text-turf-glow text-sm font-semibold">← Back home</Link>
        </p>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <HeroTile />
      <ScrollReveal className="relative z-10 px-4 -mt-6 mb-16">
        <div className="max-w-5xl mx-auto lp-glass-panel rounded-2xl p-1 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/5">
          {[
            { v: '200+', l: 'Live rooms' },
            { v: '4', l: 'Player pools' },
            { v: '<50ms', l: 'Bid sync' },
            { v: '11', l: 'XI validation' },
          ].map((s) => (
            <div key={s.l} className="px-4 py-5 text-center">
              <p className="lp-display text-2xl md:text-3xl font-bold text-white">{s.v}</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </>
  );
}
