'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';
import { NoiseEffect } from '@/components/ui/NoiseEffect';

const SLIDES = [
  'title',
  'problem',
  'why-now-img',
  'why-now',
  'product',
  'product-img',
  'tech-arch-img',
  'onchain-stack',
  'demo',
  'walkthrough-vid',
  'features-img',
  'traction',
  'team',
] as const;

const SLIDE_LABELS = [
  'Title',
  'The Pain',
  'Why Now',
  'Why Now',
  'Product',
  'Product',
  'Architecture',
  'On-chain stack',
  'Demo',
  'Walkthrough',
  'Features',
  'Traction',
  'Team',
];

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.4, 0, 0.2, 1] as const },
  }),
};

export default function PitchPage() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const isScrolling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollToSlide = useCallback((index: number) => {
    if (index < 0 || index >= SLIDES.length) return;
    isScrolling.current = true;
    setCurrentSlide(index);
    slideRefs.current[index]?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      isScrolling.current = false;
    }, 800);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        scrollToSlide(currentSlide + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToSlide(currentSlide - 1);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentSlide, scrollToSlide]);

  // Intersection observer to sync scroll with dots
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (isScrolling.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const idx = slideRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setCurrentSlide(idx);
          }
        }
      },
      { threshold: 0.6 }
    );
    slideRefs.current.forEach((ref) => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, []);

  return (
    <NoiseEffect opacity={0.6} className="relative">
      {/* Navigation dots */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col gap-3 items-center">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollToSlide(i)}
            className="group relative flex items-center"
            aria-label={`Go to slide ${i + 1}: ${SLIDE_LABELS[i]}`}
          >
            <span className="absolute right-8 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-mono text-white/60 whitespace-nowrap">
              {SLIDE_LABELS[i]}
            </span>
            <motion.div
              className="rounded-full border border-[#00E5FF]/40"
              animate={{
                width: currentSlide === i ? 12 : 8,
                height: currentSlide === i ? 12 : 8,
                backgroundColor: currentSlide === i ? '#00E5FF' : 'rgba(0,229,255,0.2)',
              }}
              transition={{ duration: 0.3 }}
            />
          </button>
        ))}
      </div>

      {/* Slide counter */}
      <div className="fixed bottom-6 right-6 z-50 font-mono text-sm text-white/30">
        {String(currentSlide + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
      </div>

      {/* Keyboard hint */}
      <AnimatePresence>
        {currentSlide === 0 && (
          <motion.div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 text-white/30 text-xs font-mono"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 2 }}
          >
            <kbd className="px-2 py-1 border border-white/20 rounded text-white/50">Space</kbd>
            <span>or scroll to navigate</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Arrow buttons */}
      {currentSlide > 0 && (
        <button
          onClick={() => scrollToSlide(currentSlide - 1)}
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 text-white/30 hover:text-[#00E5FF] transition-colors"
          aria-label="Previous slide"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      )}
      {currentSlide < SLIDES.length - 1 && (
        <button
          onClick={() => scrollToSlide(currentSlide + 1)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white/30 hover:text-[#00E5FF] transition-colors"
          aria-label="Next slide"
        >
          <motion.svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            animate={currentSlide === 0 ? { y: [0, 6, 0] } : {}}
            transition={{ repeat: Infinity, duration: 1.5 }}
          >
            <path d="M6 9l6 6 6-6" />
          </motion.svg>
        </button>
      )}

      {/* Back to home */}
      <Link
        href="/"
        className="fixed top-6 left-6 z-50 font-venite text-xl text-[#00E5FF] hover:text-white transition-colors"
      >
        SKETCH FLOW
      </Link>

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="h-screen overflow-y-auto snap-y snap-mandatory"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* ===== SLIDE 1: TITLE ===== */}
        <div
          ref={(el) => { slideRefs.current[0] = el; }}
          className="snap-start h-screen flex items-center justify-center relative overflow-hidden"
        >
          {/* Radial glow */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 50% 50%, rgba(0,229,255,0.08) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="text-center z-10 px-8"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div
              className="inline-block mb-6"
              variants={itemVariants}
              custom={0}
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-2xl bg-[#00E5FF]/20 blur-2xl" />
                <h1
                  className="relative text-7xl md:text-9xl font-venite font-bold text-[#00E5FF] tracking-[0.2em]"
                  style={{ textShadow: '4px 4px 0 #dd0000, -2px -2px 0 #0a0a0a' }}
                >
                  SKETCH FLOW
                </h1>
              </div>
            </motion.div>

            <motion.p
              className="text-xl md:text-2xl text-white/70 font-light max-w-xl mx-auto mb-8"
              variants={itemVariants}
              custom={1}
            >
              Draw your price prediction. Earn real payouts.{' '}
              <span className="text-[#00E5FF] font-semibold">60 seconds.</span>
            </motion.p>

            <motion.div
              className="flex flex-wrap justify-center gap-3"
              variants={itemVariants}
              custom={2}
            >
              {['Built on Base', 'Wallet-native', 'EigenDA commitments', 'Up to 2500x Leverage'].map((tag) => (
                <span
                  key={tag}
                  className="px-4 py-1.5 rounded-full bg-white/[0.04] border border-[#00E5FF]/20 text-xs font-mono text-[#00E5FF]/80"
                >
                  {tag}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 2: THE PAIN ===== */}
        <div
          ref={(el) => { slideRefs.current[1] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              01 — The Problem
            </motion.p>

            <motion.h2
              className="text-4xl md:text-6xl font-venite font-bold text-white mb-8 leading-tight"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              <span className="text-red-400">95%</span> of retail traders lose money
            </motion.h2>

            <motion.p
              className="text-lg text-white/50 mb-12 max-w-2xl"
              variants={itemVariants}
              custom={2}
            >
              Not because they can&apos;t read charts — because the tools are built for quant desks, not humans.
            </motion.p>

            <motion.div
              className="grid md:grid-cols-2 gap-6"
              variants={itemVariants}
              custom={3}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
                <p className="text-5xl md:text-6xl font-venite font-bold text-[#00E5FF] mb-3">$200B</p>
                <p className="text-white/40 text-sm">Daily crypto derivatives volume</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-8">
                <p className="text-5xl md:text-6xl font-venite font-bold text-[#00E5FF] mb-3">100M+</p>
                <p className="text-white/40 text-sm">Crypto users who understand price direction but can&apos;t navigate order books</p>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 3: WHY NOW IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[2] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black"
        >
          <Image
            src="/slides/why-now.png"
            alt="Why Now"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 4: WHY NOW ===== */}
        <div
          ref={(el) => { slideRefs.current[3] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              02 — Why Now
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-12"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              Three things changed
            </motion.h2>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  num: '01',
                  title: 'Base brought fees to near-zero',
                  detail: 'Micro-positions are finally viable on-chain',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.306a11.95 11.95 0 015.814-5.518l2.74-1.22m0 0l-5.94-2.281m5.94 2.28l-2.28 5.941" />
                    </svg>
                  ),
                },
                {
                  num: '02',
                  title: 'Embedded wallets killed the barrier',
                  detail: 'Users sign up with Google, not seed phrases',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
                    </svg>
                  ),
                },
                {
                  num: '03',
                  title: 'Polymarket proved the model',
                  detail: '$50B+ volume — simplified speculation has massive PMF',
                  icon: (
                    <svg className="w-8 h-8 text-[#00E5FF]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
                    </svg>
                  ),
                },
              ].map((item, i) => (
                <motion.div
                  key={item.num}
                  className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 hover:border-[#00E5FF]/30 transition-colors"
                  variants={itemVariants}
                  custom={i + 2}
                >
                  <div className="flex items-center gap-3 mb-4">
                    {item.icon}
                    <span className="text-sm font-mono text-[#00E5FF]/50">{item.num}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/40">{item.detail}</p>
                </motion.div>
              ))}
            </div>

            <motion.p
              className="mt-8 text-sm font-mono text-white/30 text-center"
              variants={itemVariants}
              custom={6}
            >
              Current perp DEXs are powerful but intimidating. Prediction markets are simple but binary. Sketch Flow fills the gap.
            </motion.p>
          </motion.div>
        </div>

        {/* ===== SLIDE 5: THE PRODUCT ===== */}
        <div
          ref={(el) => { slideRefs.current[4] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 50% 40% at 50% 60%, rgba(0,229,255,0.05) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20 z-10"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              04 — The Product
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-4"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              Draw. Predict. <span className="text-[#00E5FF]">Earn.</span>
            </motion.h2>

            <motion.p
              className="text-base text-white/50 mb-10 max-w-2xl"
              variants={itemVariants}
              custom={2}
            >
              Predict price movement by drawing a curve and earn real payouts in 60 seconds, instead of learning perpetual futures.
            </motion.p>

            {/* How it works visual flow */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                { step: '01', label: 'Draw a price curve', desc: 'On a live BTC chart canvas' },
                { step: '02', label: 'Pick your stake', desc: 'As low as $0.10' },
                { step: '03', label: '59 predictions scored', desc: 'Against real price data' },
                { step: '04', label: 'Instant payout', desc: '>50% accuracy = profit' },
              ].map((item, i) => (
                <motion.div
                  key={item.step}
                  className="rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-6 text-center"
                  variants={itemVariants}
                  custom={i + 3}
                >
                  <p className="text-2xl font-mono font-bold text-[#00E5FF] mb-2">{item.step}</p>
                  <p className="text-sm font-bold text-white mb-1">{item.label}</p>
                  <p className="text-xs text-white/40">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Differentiator bar */}
            <motion.div
              className="flex flex-wrap justify-center gap-6 text-sm"
              variants={itemVariants}
              custom={7}
            >
              {[
                { icon: '✕', label: 'No order books', color: 'text-red-400' },
                { icon: '✕', label: 'No liquidations', color: 'text-red-400' },
                { icon: '✕', label: 'No complexity', color: 'text-red-400' },
                { icon: '✓', label: 'Just draw and earn', color: 'text-[#00E5FF]' },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-2 text-white/50">
                  <span className={`${item.color} font-bold text-lg`}>{item.icon}</span>
                  {item.label}
                </span>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 6: PRODUCT IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[5] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black"
        >
          <Image
            src="/slides/product.png"
            alt="Product"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 7: TECHNICAL ARCHITECTURE IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[6] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black"
        >
          <Image
            src="/slides/technical-architecture.png"
            alt="Technical Architecture"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 8: ON-CHAIN STACK ===== */}
        <div
          ref={(el) => { slideRefs.current[7] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              07 — On-chain stack
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-4"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              Real contracts, <span className="text-[#00E5FF]">real settlement</span>
            </motion.h2>

            <motion.p
              className="text-base text-white/50 mb-10 max-w-2xl"
              variants={itemVariants}
              custom={2}
            >
              LineFutures on Base for collateral and PnL; predictions and price windows committed to EigenDA; automation closes expired positions server-side.
            </motion.p>

            <div className="grid md:grid-cols-3 gap-6 mb-8">
              {[
                {
                  title: 'LineFutures',
                  addr: 'Deployed',
                  desc: 'Positions, leverage, fees, and settlement events on Base',
                  accent: true,
                },
                {
                  title: 'Price pipeline',
                  addr: 'Bybit → Mongo',
                  desc: 'Live windows aligned to the 60s prediction horizon',
                  accent: false,
                },
                {
                  title: 'Automation',
                  addr: 'Backend',
                  desc: 'Scheduled closes once the minute elapses and data is available',
                  accent: false,
                },
              ].map((item, i) => (
                <motion.div
                  key={item.title}
                  className={`rounded-2xl p-6 ${
                    item.accent
                      ? 'border border-[#00E5FF]/30 bg-[#00E5FF]/[0.04]'
                      : 'border border-white/10 bg-white/[0.02]'
                  }`}
                  variants={itemVariants}
                  custom={i + 3}
                >
                  <p className="text-xs font-mono text-[#00E5FF]/50 mb-2">{item.addr}</p>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-white/40">{item.desc}</p>
                </motion.div>
              ))}
            </div>

            {/* Classic perps vs Sketch Flow */}
            <motion.div
              className="grid md:grid-cols-2 gap-6"
              variants={itemVariants}
              custom={6}
            >
              <div className="rounded-2xl border border-red-400/20 bg-red-400/[0.03] p-6">
                <p className="text-sm font-mono text-red-400/70 mb-3">Classic perp UX</p>
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Order book and lever jargon first</li>
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Hard to explain in one sentence</li>
                  <li className="flex items-start gap-2"><span className="text-red-400 mt-0.5">✕</span> Feels like a terminal, not a game</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-6">
                <p className="text-sm font-mono text-[#00E5FF]/70 mb-3">Sketch Flow</p>
                <ul className="space-y-2 text-sm text-white/50">
                  <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> Draw the path you expect</li>
                  <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> One wallet tx to open (native gas)</li>
                  <li className="flex items-start gap-2"><span className="text-[#00E5FF] mt-0.5">✓</span> Payout settles to your wallet on-chain</li>
                </ul>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* ===== SLIDE 9: DEMO FLOW ===== */}
        <div
          ref={(el) => { slideRefs.current[8] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              08 — Live Demo Flow
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-10"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              Draw to earn in <span className="text-[#00E5FF]">60 seconds</span>
            </motion.h2>

            {/* Visual flow: vertical timeline */}
            <div className="relative">
              {/* Connector line */}
              <div className="absolute left-[19px] top-4 bottom-4 w-px bg-gradient-to-b from-[#00E5FF]/40 via-[#00E5FF]/20 to-transparent hidden md:block" />

              <div className="space-y-5">
                {[
                  { step: '1', text: 'Open predict page — live BTC chart streaming' },
                  { step: '2', text: 'Draw a price curve on the canvas' },
                  { step: '3', text: 'Set stake, leverage, 1-min window' },
                  { step: '4', text: 'Submit — wallet signs LineFutures.openPosition (ETH value)' },
                  { step: '5', text: 'Position is live on Base' },
                  { step: '6', text: 'Auto-settles, PnL from accuracy' },
                  { step: '7', text: 'Payout to your wallet when the minute closes' },
                ].map((item, i) => (
                  <motion.div
                    key={item.step}
                    className="flex items-center gap-5"
                    variants={itemVariants}
                    custom={i + 2}
                  >
                    <div className="w-10 h-10 rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-mono font-bold text-[#00E5FF]">{item.step}</span>
                    </div>
                    <p className="text-base text-white/60">{item.text}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ===== SLIDE 10: WALKTHROUGH VIDEO ===== */}
        <div
          ref={(el) => { slideRefs.current[9] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black"
        >
          <video
            src={
              process.env.NEXT_PUBLIC_PITCH_WALKTHROUGH_VIDEO_URL ||
              '/slides/SketchFlow-Walkthrough.mp4'
            }
            className="w-full h-full object-contain"
            controls
            playsInline
            preload="metadata"
          />
        </div>

        {/* ===== SLIDE 11: FEATURES IMAGE ===== */}
        <div
          ref={(el) => { slideRefs.current[10] = el; }}
          className="snap-start h-screen flex items-center justify-center relative bg-black"
        >
          <Image
            src="/slides/features.png"
            alt="Features"
            fill
            className="object-contain"
            priority
          />
        </div>

        {/* ===== SLIDE 12: TRACTION + ROADMAP ===== */}
        <div
          ref={(el) => { slideRefs.current[11] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <motion.div
            className="max-w-5xl mx-auto px-8 md:px-20"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              11 — Traction & Roadmap
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-10"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              Shipped & <span className="text-[#00E5FF]">shipping</span>
            </motion.h2>

            <div className="grid md:grid-cols-2 gap-8">
              {/* Now */}
              <motion.div
                className="rounded-2xl border border-[#00E5FF]/20 bg-[#00E5FF]/[0.03] p-8"
                variants={itemVariants}
                custom={2}
              >
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#00E5FF] animate-pulse" />
                  <p className="text-sm font-mono text-[#00E5FF]/70">LIVE NOW</p>
                </div>
                <ul className="space-y-4">
                  {[
                    'Live on Base mainnet',
                    'Wallet-native opens against LineFutures',
                    '4 trading pairs (BTC, ETH, AAVE, DOGE)',
                    'Auto position closer (every 10s)',
                    'Leaderboard: accuracy, PnL, win rate',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/60">
                      <span className="text-[#00E5FF] mt-0.5 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>

              {/* Next 90 days */}
              <motion.div
                className="rounded-2xl border border-white/10 bg-white/[0.02] p-8"
                variants={itemVariants}
                custom={3}
              >
                <p className="text-sm font-mono text-white/40 mb-6">NEXT 90 DAYS</p>
                <ul className="space-y-4">
                  {[
                    'Prediction tournaments with prize pools',
                    '10+ token pairs',
                    'Mobile-optimized drawing',
                    'Social: share predictions, follow top drawers',
                    '1,000 active weekly users target',
                  ].map((item, i) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white/40">
                      <div className="relative mt-1.5 shrink-0">
                        <div className={`w-2 h-2 rounded-full border border-white/30 ${i === 0 ? 'bg-white/30' : ''}`} />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </motion.div>
        </div>

        {/* ===== SLIDE 13: TEAM ===== */}
        <div
          ref={(el) => { slideRefs.current[12] = el; }}
          className="snap-start h-screen flex items-center justify-center relative"
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 50% 40% at 50% 70%, rgba(0,229,255,0.06) 0%, transparent 70%)',
            }}
          />
          <motion.div
            className="max-w-3xl mx-auto px-8 text-center z-10"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.p
              className="text-sm font-mono tracking-widest uppercase text-[#00E5FF]/70 mb-6"
              variants={itemVariants}
              custom={0}
            >
              12 — Team
            </motion.p>

            <motion.h2
              className="text-4xl md:text-5xl font-venite font-bold text-white mb-12"
              variants={itemVariants}
              custom={1}
              style={{ textShadow: '3px 3px 0 #000' }}
            >
              The builders
            </motion.h2>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  initials: 'FF',
                  name: 'Fabian Ferno',
                  role: 'Full-stack Web3',
                  cred: 'Scaled products to 10K+ users',
                  focus: 'Smart contract architecture',
                },
                {
                  initials: 'PS',
                  name: 'Philo Sanjay',
                  role: 'Backend Systems',
                  cred: 'Real-time price pipeline',
                  focus: 'Settlement engine',
                },
                {
                  initials: 'SA',
                  name: 'Silas Ashar',
                  role: 'Frontend & Product',
                  cred: 'Drawing interface design',
                  focus: 'Trading UX',
                },
              ].map((member, i) => (
                <motion.div
                  key={member.name}
                  className="flex flex-col items-center"
                  variants={itemVariants}
                  custom={i + 2}
                >
                  <div className="w-20 h-20 rounded-full border-2 border-[#00E5FF]/40 bg-[#00E5FF]/10 flex items-center justify-center mb-4">
                    <span className="text-xl font-venite font-bold text-[#00E5FF]">{member.initials}</span>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">{member.name}</h3>
                  <p className="text-xs font-mono text-[#00E5FF]/60 mb-3">{member.role}</p>
                  <ul className="space-y-1.5 text-left">
                    <li className="flex items-start gap-2 text-xs text-white/40">
                      <span className="text-[#00E5FF] mt-0.5">✓</span> {member.cred}
                    </li>
                    <li className="flex items-start gap-2 text-xs text-white/40">
                      <span className="text-[#00E5FF] mt-0.5">✓</span> {member.focus}
                    </li>
                  </ul>
                </motion.div>
              ))}
            </div>

            {/* CTA */}
            <motion.div
              className="mt-16"
              variants={itemVariants}
              custom={6}
            >
              <motion.div
                whileHover={{ scale: 1.05, x: -2, y: -2 }}
                whileTap={{ scale: 0.95, x: 2, y: 2 }}
              >
                <Link
                  href="/predict"
                  className="inline-block px-10 py-4 text-lg font-bold text-[#000000] bg-[#00E5FF] border-4 border-[#0a0a0a] rounded-xl shadow-[6px_6px_0_0_#0a0a0a] transition-all hover:shadow-[8px_8px_0_0_#0a0a0a]"
                >
                  Try Sketch Flow
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </NoiseEffect>
  );
}
