import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ENTER_ARENA_EVENT = 'ipl-enter-arena';

function handleEnterArena() {
  document.dispatchEvent(new CustomEvent(ENTER_ARENA_EVENT));
}

// Animation Variants
const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6 }
};

const staggerContainer = {
  animate: { transition: { staggerChildren: 0.1 } }
};

export default function PremiumLandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      {/* Premium Background Mesh */}
      <div className="fixed inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      {/* How to Play Modal */}
      <AnimatePresence>
        {showHowToPlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
            onClick={() => setShowHowToPlay(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-slate-900/90 border border-white/10 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-3xl font-black italic tracking-tighter text-indigo-400">HOW TO PLAY</h2>
                  <button onClick={() => setShowHowToPlay(false)} className="text-slate-400 hover:text-white transition-colors">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                
                <div className="space-y-6 text-slate-300 leading-relaxed">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">1</div>
                    <p><span className="text-white font-semibold">Join the Lobby:</span> Use a 5-letter code to enter a room or host your own.</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">2</div>
                    <p><span className="text-white font-semibold">The Auction:</span> Bidding happens in real-time. Watch your purse limit and use RTM cards wisely!</p>
                  </div>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">3</div>
                    <p><span className="text-white font-semibold">Squad Building:</span> Manage your 11 players, ensure foreign quotas are met, and dominate the leaderboard.</p>
                  </div>
                </div>

                <button
                  onClick={() => { setShowHowToPlay(false); handleEnterArena(); }}
                  className="w-full mt-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-bold text-white transition-all shadow-lg shadow-indigo-500/20"
                >
                  GOT IT, LET'S PLAY
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ticker Tape */}
      <div className="fixed top-0 left-0 w-full h-10 bg-indigo-600 z-50 flex items-center overflow-hidden border-b border-white/10">
        <div className="whitespace-nowrap flex gap-12 font-bold text-xs tracking-[0.2em] animate-marquee uppercase text-indigo-100">
          {[...Array(4)].map((_, i) => (
            <span key={i} className="flex gap-12">
              <span>Real-Time Bidding</span> <span>•</span>
              <span>Multiple Player Pools</span> <span>•</span>
              <span>Squad Validation</span> <span>•</span>
              <span>Live Leaderboards</span> <span>•</span>
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <nav className={`fixed top-10 w-full z-40 transition-all duration-500 ${scrolled ? 'bg-slate-950/80 backdrop-blur-xl py-4 shadow-2xl' : 'bg-transparent py-8'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="text-2xl font-black tracking-tighter group cursor-pointer">
            <span className="text-white group-hover:text-indigo-500 transition-colors">⚡ IPL</span> 
            <span className="text-indigo-500 group-hover:text-white transition-colors ml-2">AUCTION</span>
          </div>
          <div className="hidden md:flex gap-10 items-center">
            {['Features', 'Pools', 'FAQ'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className="text-sm font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-widest">{item}</a>
            ))}
            <button 
              onClick={() => setShowHowToPlay(true)}
              className="px-5 py-2 rounded-full border border-indigo-500/50 text-indigo-400 text-xs font-black uppercase hover:bg-indigo-500 hover:text-white transition-all"
            >
              How to Play
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-48 pb-32 px-6 flex flex-col items-center text-center z-10">
        <motion.div 
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
          className="mb-8"
        >
          <span className="px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-black tracking-widest">
            THE NEXT GEN SIMULATOR
          </span>
        </motion.div>

        <motion.h1 
          className="text-6xl md:text-8xl font-black tracking-tight leading-[0.9] mb-8"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          OWN THE <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient">AUCTION FLOOR</span>
        </motion.h1>

        <motion.p 
          className="text-slate-400 text-lg md:text-xl max-w-2xl mb-12"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          Experience the high-stakes thrill of a real IPL auction. Build your dream squad with real-time multiplayer bidding and live statistics.
        </motion.p>

        <motion.div 
          className="flex flex-col sm:flex-row gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button
            onClick={handleEnterArena}
            className="group relative px-10 py-5 bg-indigo-600 rounded-2xl font-black text-white overflow-hidden transition-all hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
            <span className="relative flex items-center gap-3">
              ⚡ ENTER ARENA
            </span>
          </button>
          <button
            onClick={() => setShowHowToPlay(true)}
            className="px-10 py-5 bg-white/5 border border-white/10 rounded-2xl font-black text-white hover:bg-white/10 transition-all hover:scale-105 active:scale-95"
          >
            LEARN MECHANICS
          </button>
        </motion.div>
      </section>

      {/* Feature Grid */}
      <section id="features" className="py-32 px-6 max-w-7xl mx-auto">
        <motion.div 
          variants={staggerContainer}
          initial="initial"
          whileInView="animate"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {[
            { title: "Real-Time Sockets", desc: "Instant bid synchronization with 0ms lag using advanced WebSockets." },
            { title: "Dynamic Purse", desc: "Automated salary cap management and squad validation rules." },
            { title: "Player Cards", desc: "Export high-quality cards of your final Playing XI to share on social media." }
          ].map((feat, i) => (
            <motion.div 
              key={i} 
              variants={fadeInUp}
              className="p-10 rounded-3xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all hover:bg-white/[0.07]"
            >
              <div className="w-12 h-12 bg-indigo-500/20 rounded-xl mb-6 flex items-center justify-center text-indigo-400 font-bold">0{i+1}</div>
              <h3 className="text-xl font-bold mb-4">{feat.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{feat.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Footer (Simplified & Premium) */}
      <footer className="py-12 border-t border-white/5 bg-slate-950/50 backdrop-blur-md relative z-10">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-slate-500 text-sm font-medium">
            © 2026 IPL Auction Simulator. Created with ❤️ by <span className="text-white font-bold tracking-tighter">PRS</span>
          </div>
          <div className="flex gap-8">
             <a href="https://discord.gg/gpACU3Gdg" target="_blank" className="opacity-50 hover:opacity-100 transition-opacity"><img src="https://img.icons8.com/ios-filled/50/ffffff/discord-logo.png" width="24" /></a>
             <a href="https://whatsapp.com" target="_blank" className="opacity-50 hover:opacity-100 transition-opacity"><img src="https://img.icons8.com/ios-filled/50/ffffff/whatsapp--v1.png" width="24" /></a>
          </div>
        </div>
      </footer>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-25%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient {
          animation: gradient 5s ease infinite;
        }
      `}</style>
    </div>
  );
}
