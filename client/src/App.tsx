import React, { useEffect, useState } from 'react';

const ENTER_ARENA_EVENT = 'ipl-enter-arena';

function handleEnterArena() {
  document.dispatchEvent(new CustomEvent(ENTER_ARENA_EVENT));
}

export default function App() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Infinite Tape */}
      <div className="fixed top-0 left-0 w-full h-10 bg-gradient-to-r from-indigo-600 to-purple-600 z-50 flex items-center overflow-hidden lp-tape">
        <div className="infinite-tape-content whitespace-nowrap flex gap-8 font-bold text-sm tracking-wider pl-full">
          <span>LIVE AUCTION SIMULATOR WITH MULTIPLE PLAYER POOLS</span>
          <span>•</span>
          <span>REAL-TIME MULTIPLAYER</span>
          <span>•</span>
          <span>BUILD YOUR DREAM TEAM</span>
          <span>•</span>
          <span>GET EVERY PLAYER CARDS</span>
          <span>•</span>
          <span>GET YOUR PLAYING 11 CARD</span>
          <span>•</span>
          <span>SEE THE LEADERBOARD</span>
          <span>•</span>
          <span>LET'S BID!</span>
        </div>
      </div>

      {/* Navigation */}
      <nav
        className={
          'fixed top-10 w-full z-40 transition-all duration-300 ' +
          (scrolled
            ? 'bg-[#020617]/95 backdrop-blur-md shadow-lg py-3'
            : 'bg-transparent py-5')
        }
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex justify-between items-center">
          <div className="text-2xl font-black tracking-tighter hover:scale-105 transition-transform cursor-pointer">
            ⚡ IPL <span className="text-gradient">AUCTION</span>
          </div>
          <div className="hidden md:flex gap-8 font-medium text-slate-400">
            {['How to Play', 'Features', 'Player Pools', 'FAQ'].map((item) => (
              <a
                key={item}
                href={'#' + item.toLowerCase().replace(/\s+/g, '-')}
                className="hover:text-white hover:text-indigo-400 transition-colors relative group"
              >
                {item}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-indigo-500 transition-all group-hover:w-full" />
              </a>
            ))}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-3 md:pt-32 pb-8 px-4 min-h-screen flex flex-col justify-start md:justify-center items-center overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/20 rounded-full blur-3xl opacity-30 pointer-events-none" />

        <div className="relative z-20 glass p-8 md:p-12 max-w-4xl w-full text-center mt-8 md:mt-0 lp-hero-tile">
          <div className="lp-hero-anim-wrap" aria-hidden="true">
            <div className="lp-hero-anim-item">
              <svg viewBox="0 0 200 200" className="lp-hero-anim-svg">
                <circle cx="20" cy="180" r="12" fill="#fff" className="lp-ball" />
                <g className="lp-stump-group">
                  <rect x="85" y="60" width="8" height="100" rx="2" fill="#e2e8f0" />
                  <rect x="105" y="60" width="8" height="100" rx="2" fill="#e2e8f0" />
                  <rect x="125" y="60" width="8" height="100" rx="2" fill="#e2e8f0" />
                  <rect x="88" y="54" width="20" height="6" rx="2" fill="#cbd5e1" className="lp-bail-left" />
                  <rect x="112" y="54" width="20" height="6" rx="2" fill="#cbd5e1" className="lp-bail-right" />
                </g>
              </svg>
            </div>
            <div className="lp-hero-anim-item">
              <svg viewBox="0 0 200 200" className="lp-hero-anim-svg">
                <g className="lp-hammer-group">
                  <rect x="80" y="40" width="80" height="50" rx="8" fill="#a855f7" />
                  <rect x="110" y="90" width="20" height="80" rx="4" fill="#7e22ce" />
                  <path d="M85 45 H155 L150 55 H90 Z" fill="rgba(255,255,255,0.3)" />
                </g>
                <ellipse cx="120" cy="170" rx="40" ry="10" fill="#475569" opacity="0.5" />
              </svg>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm font-bold mb-8">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
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
            <button
              type="button"
              className="px-8 py-4 bg-transparent border border-white/10 rounded-xl font-bold text-white hover:bg-white/5 hover:-translate-y-1 transition-all"
              onClick={() => {
                const el = document.getElementById('how-to-play');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              VIEW RULES
            </button>
          </div>
        </div>

        <div className="mt-5 md:mt-12 flex gap-4 text-slate-500 animate-bounce relative z-20">
          <span className="text-2xl">⌄</span>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="pt-12 md:pt-24 pb-24 px-4 relative">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            <span className="text-gradient">PRO FEATURES</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🖥️', title: 'Real-Time Sockets', desc: 'Instant bid updates synchronized across all devices. No refreshing required.' },
              { icon: '💰', title: 'Smart Purse', desc: 'Automated budget validation. The system prevents overspending and tracks remaining funds.' },
              { icon: '📊', title: 'Live Leaderboard', desc: 'Track squad composition, foreign player quotas, and RTM status in real-time.' },
              { icon: '🎨', title: 'Pro UI Design', desc: 'A completely immersive dark-mode interface designed for long auction sessions.' },
            ].map((feature, i) => (
              <div key={i} className="glass p-8 hover:-translate-y-2 transition-transform group">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-indigo-500/20 group-hover:rotate-6 transition-all text-indigo-400 text-2xl">
                  <span>{feature.icon}</span>
                </div>
                <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                <p className="text-slate-400 leading-relaxed text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Player Pools */}
      <section id="player-pools" className="pt-12 md:pt-24 pb-24 px-4 bg-slate-900/30">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            AVAILABLE <span className="text-indigo-400">PLAYER POOLS</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🏆', title: 'IPL 2026', desc: 'Standard IPL player pool for the 2026 season.' },
              { icon: '⚡', title: 'LEGENDS', desc: 'All-time cricket legends from history.' },
              { icon: '👥', title: 'MIXED', desc: 'Great icons from various eras combined.' },
              { icon: '🛠️', title: 'CUSTOM', desc: 'Build your own player pool.' },
            ].map((pool, i) => (
              <div key={i} className="glass p-8 text-center hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="mb-6 transform group-hover:scale-110 transition-transform inline-block text-4xl">{pool.icon}</div>
                <h3 className="text-xl font-bold mb-2 group-hover:text-indigo-400 transition-colors">{pool.title}</h3>
                <p className="text-slate-400 text-sm">{pool.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Player Cards Scroller */}
      <section id="player-cards" className="pt-12 md:pt-24 pb-24 overflow-hidden">
        <h2 className="text-3xl md:text-5xl font-bold text-center mb-4">
          PLAYER <span className="text-purple-400">CARDS</span>
        </h2>
        <p className="text-center text-slate-400 mb-12">Preview dynamic player cards that update in real-time</p>
        <div className="relative w-full">
          <div className="lp-cards-track px-4">
            {[...Array(2)].map((_, setIndex) => (
              <React.Fragment key={setIndex}>
                {[
                  { name: 'Virat Kohli', role: 'Batsman', stats: { Matches: 102, Runs: '8000+', Avg: 50 } },
                  { name: 'Jasprit Bumrah', role: 'Bowler', stats: { Matches: 80, Wickets: '150+', Econ: 6.5 } },
                  { name: 'MS Dhoni', role: 'Wk-Keeper', stats: { Matches: 200, Runs: '5000+', Stumps: 100 } },
                  { name: 'Rohit Sharma', role: 'Batsman', stats: { Matches: 190, Runs: '7000+', SR: 130 } },
                  { name: 'Rashid Khan', role: 'Bowler', stats: { Matches: 90, Wickets: '120+', Econ: 6.2 } },
                  { name: 'Ben Stokes', role: 'All-Rounder', stats: { Matches: 85, Runs: '3000+', Wickets: 70 } },
                ].map((player, i) => (
                  <div
                    key={`${setIndex}-${i}`}
                    className="w-64 h-80 glass p-6 flex flex-col items-center justify-between shrink-0 hover:scale-105 transition-transform hover:shadow-[0_0_30px_rgba(99,102,241,0.3)] group"
                  >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 mb-4 flex items-center justify-center text-3xl font-bold shadow-lg">
                      {player.name.charAt(0)}
                    </div>
                    <div className="text-center">
                      <h3 className="text-xl font-bold group-hover:text-indigo-300 transition-colors">{player.name}</h3>
                      <p className="text-indigo-400 text-sm font-medium uppercase tracking-wider">{player.role}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 w-full mt-4 pt-4 border-t border-white/10">
                      {Object.entries(player.stats).map(([label, val]) => (
                        <div key={label} className="text-center">
                          <div className="font-bold text-slate-200">{String(val)}</div>
                          <div className="text-[10px] text-slate-500 uppercase">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-to-play" className="pt-12 md:pt-24 pb-24 px-4 bg-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">
            HOW IT <span className="text-gradient">WORKS</span>
          </h2>
          <div className="space-y-6">
            {[
              { id: '01', title: 'Create or Join', desc: 'Host a private room and get a unique 5-letter code to share with friends.', color: 'text-amber-400' },
              { id: '02', title: 'Pick Your Team', desc: 'Select your franchise (CSK, MI, RCB, etc.). First come, first served logic applies.', color: 'text-indigo-400' },
              { id: '03', title: 'War Room', desc: 'Use the live bidding interface. The host controls the flow, you control the cash.', color: 'text-pink-400' },
            ].map((step) => (
              <div key={step.id} className="glass p-8 flex items-center gap-8 hover:translate-x-2 transition-transform">
                <div className="text-6xl font-black text-white/5">{step.id}</div>
                <div>
                  <h3 className={'text-2xl font-bold mb-2 ' + step.color}>{step.title}</h3>
                  <p className="text-slate-400">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="pt-12 md:pt-24 pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold text-center mb-16">FAQ</h2>
          <div className="space-y-4">
            {[
              { q: 'What is IPL Auction?', a: "It's a live multiplayer cricket auction simulator where you can bid on players with friends." },
              { q: 'How do I create a room?', a: "Click 'ENTER ARENA' and choose 'CREATE ROOM' to host a private auction." },
              { q: 'Can I play with custom players?', a: "Yes, select the 'CUSTOM' player pool to build your own set." },
            ].map((faq, i) => (
              <div key={i} className="glass p-6">
                <h3 className="font-bold text-lg mb-2 text-indigo-300">{faq.q}</h3>
                <p className="text-slate-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer
        className="app-footer"
        style={{ position: 'fixed', bottom: 0, left: 0, width: '100%', zIndex: 100 }}
      >
        <div className="footer-content">
          <span>
            Made with <span style={{ color: '#e11d48' }}>❤️</span> by <b>PRS</b>
          </span>
          <span className="separator">•</span>
          <a
            href="https://docs.google.com/document/d/1Fz7SsuT23zZvWAuQE7FJTJ0QsZ-sZa6hliIG9fKVNXE/edit?tab=t.0"
            target="_blank"
            rel="noreferrer"
            className="footer-link"
          >
            Support for ☕
          </a>
          <span className="separator">•</span>
          <div className="social-links">
            <a href="https://discord.gg/gpACU3Gdg" target="_blank" rel="noreferrer">
              <img width="20" height="20" src="https://img.icons8.com/ios-filled/50/ffffff/discord-logo.png" alt="discord" />
            </a>
            <a href="https://whatsapp.com/channel/0029Vb7Z5EABKfi1oKCpTB3j" target="_blank" rel="noreferrer">
              <img width="18" height="18" src="https://img.icons8.com/ios-filled/50/ffffff/whatsapp--v1.png" alt="whatsapp" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
