import React, { useEffect, useState } from 'react';

const ENTER_ARENA_EVENT = 'ipl-enter-arena';

function handleEnterArena() {
  document.dispatchEvent(new CustomEvent(ENTER_ARENA_EVENT));
}

export default function App() {
  const [scrolled, setScrolled] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-transparent text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* How to Play modal */}
      {showHowToPlay && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowHowToPlay(false)}
          role="dialog"
          aria-modal="true"
          aria-label="How to Play"
        >
          <div
            className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-white/10 bg-slate-800/50">
              <h2 className="text-xl font-bold text-indigo-400">How to Play</h2>
              <button
                type="button"
                onClick={() => setShowHowToPlay(false)}
                className="text-slate-400 hover:text-white p-1 rounded"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto text-sm space-y-4 text-slate-300">
              <p className="leading-relaxed">Create or join a room with a 5-letter code. Pick your franchise (CSK, MI, RCB, etc.). The host starts the auction; you bid in real time. Stay within purse limits and squad rules.</p>
              <h3 className="font-semibold text-white">About sets</h3>
              <p className="leading-relaxed">Each auction uses a <strong>player set</strong>: IPL 2026 (current squad), Legends (all-time greats), Mixed (icons from different eras), or Custom (your own pool). The host chooses the set when creating the room.</p>
              <h3 className="font-semibold text-white">Custom player pool</h3>
              <p className="leading-relaxed">When creating a room, select &quot;Custom&quot; to build your own set. You can <strong>show available players</strong> from the database and pick who to include, or <strong>upload your own pool</strong> via a CSV file (columns: Name, Role, Tag e.g. WK1/BAT1, optional Rating, optional RTM). Confirm the set before starting the auction.</p>
              <h3 className="font-semibold text-white">Spectators</h3>
              <p className="leading-relaxed">If the auction has already started and all teams are taken, you can join as a spectator to watch the bidding. Use &quot;Join Team&quot; later if a spot opens.</p>
            </div>
            <div className="p-4 border-t border-white/10 bg-slate-800/30">
              <button
                type="button"
                onClick={() => { setShowHowToPlay(false); handleEnterArena(); }}
                className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
              >
                Start Play
              </button>
            </div>
          </div>
        </div>
      )}

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
            <button type="button" onClick={() => setShowHowToPlay(true)} className="hover:text-white hover:text-indigo-400 transition-colors relative group bg-transparent border-none cursor-pointer font-inherit">
              How to Play
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-indigo-500 transition-all group-hover:w-full" />
            </button>
            {['Features', 'Player Pools', 'FAQ'].map((item) => (
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
              onClick={() => setShowHowToPlay(true)}
            >
              HOW TO PLAY
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
              { Icon: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="2"/><path strokeLinecap="round" strokeWidth="2" d="M8 21h8M12 17v4"/></svg>, title: 'Real-Time Sockets', desc: 'Instant bid updates synchronized across all devices. No refreshing required.' },
              { Icon: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>, title: 'Smart Purse', desc: 'Automated budget validation. The system prevents overspending and tracks remaining funds.' },
              { Icon: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>, title: 'Live Leaderboard', desc: 'Track squad composition, foreign player quotas, and RTM status in real-time.' },
              { Icon: () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>, title: 'Pro UI Design', desc: 'A completely immersive dark-mode interface designed for long auction sessions.' },
            ].map((feature, i) => (
              <div key={i} className="glass p-8 hover:-translate-y-2 transition-transform group">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-indigo-500/20 group-hover:rotate-6 transition-all text-indigo-400">
                  <feature.Icon />
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
              { Icon: () => <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>, title: 'IPL 2026', desc: 'Standard IPL player pool for the 2026 season.' },
              { Icon: () => <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>, title: 'LEGENDS', desc: 'All-time cricket legends from history.' },
              { Icon: () => <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>, title: 'MIXED', desc: 'Great icons from various eras combined.' },
              { Icon: () => <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>, title: 'CUSTOM', desc: 'Build your own player pool.' },
            ].map((pool, i) => (
              <div key={i} className="glass p-8 text-center hover:bg-white/5 transition-colors cursor-pointer group">
                <div className="mb-6 transform group-hover:scale-110 transition-transform inline-flex items-center justify-center text-indigo-400">
                  <pool.Icon />
                </div>
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
      <section id="faq" className="pt-12 md:pt-24 pb-16 px-4">
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

      {/* Bottom CTA — Start Play */}
      <section className="pt-8 pb-32 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-slate-400 mb-6">Ready to build your dream team?</p>
          <button
            type="button"
            onClick={handleEnterArena}
            className="px-10 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold text-white shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-1 transition-all inline-flex items-center gap-2"
          >
            <span>⚡</span> Start Play
          </button>
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
