'use client';

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  PencilSquareIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { NoiseEffect } from "@/components/ui/NoiseEffect";
import { Header, Footer } from "@/components/layout";
import ColorBlends from "@/components/ColorBlends";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] as const },
  },
};

export default function Home() {
  return (
    <NoiseEffect opacity={1} className="min-h-screen flex flex-col">
      <div className="relative flex flex-col min-h-screen">
        {/* Header */}
        <div className="relative z-20">
          <Header />
        </div>



        {/* Content overlay */}
        <div className="relative z-10 flex-1">
          {/* Hero Section */}
          <section className="relative flex min-h-[70vh] flex-col md:flex-row items-center justify-center px-4 sm:px-8 md:px-14 py-8 md:py-12 text-start gap-8 md:gap-0 overflow-hidden">
            {/* Animated color blends background */}
            <div className="absolute inset-0 z-0 opacity-30">
              <ColorBlends
                colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
                rotation={0}
                speed={0.2}
                scale={1}
                frequency={1}
                warpStrength={1}
                mouseInfluence={1}
                parallax={0.5}
                noise={0.1}
                transparent
                autoRotate={0}
                className="absolute inset-0 w-full h-full"
              />
            </div>
            {/* Cyan gradient radial - light, bottom */}
            <div
              className="absolute inset-x-0 bottom-0 h-2/3 pointer-events-none z-1"
              aria-hidden="true"
              style={{
                background: 'radial-gradient(ellipse 100% 80% at 50% 100%, rgba(0, 229, 255, 0.12) 0%, transparent 65%)',
              }}
            />
            <motion.div
              className="max-w-3xl z-10 space-y-4 md:space-y-6 w-full md:w-auto"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div
                className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 md:gap-8 mb-6 md:mb-8"
              >
                <motion.h1
                  className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold font-venite leading-tight tracking-[0.2em] text-[#00E5FF] drop-shadow-lg text-center sm:text-left"
                  variants={itemVariants}
                  style={{ textShadow: '4px 4px 0 #dd0000, -2px -2px 0 #0a0a0a' }}
                >
                  SKETCH FLOW
                </motion.h1>
              </motion.div>
              <motion.p
                className="mt-6 md:mt-10 text-lg sm:text-xl md:text-2xl font-bold text-white drop-shadow-md text-center md:text-left"
                variants={itemVariants}
              >
                We&apos;ve invented a new way to trade futures. <br /> <span className="text-[#00E5FF]">Draw your futures.</span>
              </motion.p>

              <motion.p
                className="text-sm sm:text-base md:text-md leading-relaxed text-white/80 text-center md:text-left"
                variants={itemVariants}
              >
                is a gamified derivatives trading platform on Base. Users draw price predictions instead of placing orders; positions settle on-chain from the wallet.
              </motion.p>

              <motion.div
                className="flex flex-col items-center justify-center md:justify-start gap-3 sm:gap-4 pt-2 sm:flex-row w-full md:w-auto"
                variants={itemVariants}
              >

                <motion.div
                  whileHover={{ scale: 1.05, x: -2, y: -2 }}
                  whileTap={{ scale: 0.95, x: 2, y: 2 }}
                  className="w-full sm:w-auto"
                >
                  <Link
                    href="/predict"
                    className="inline-block w-full sm:w-auto text-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-bold text-[#00E5FF] bg-[#000000] border-4 border-[#00E5FF] rounded-xl shadow-[6px_6px_0_0_#000000] transition-all hover:shadow-[8px_8px_0_0_#000000]"
                  >
                    Play Now
                  </Link>
                </motion.div>


                <motion.div
                  whileHover={{ scale: 1.05, x: -2, y: -2 }}
                  whileTap={{ scale: 0.95, x: 2, y: 2 }}
                  className="w-full sm:w-auto"
                >
                  <Link
                    href="/leaderboard"
                    className="inline-block w-full sm:w-auto text-center px-6 sm:px-8 py-3 sm:py-4 text-base sm:text-lg font-black text-[#000000] bg-[#00E5FF]/80 border-4 border-[#000000] rounded-xl shadow-[6px_6px_0_0_#000000] transition-all hover:shadow-[8px_8px_0_0_#000000]"
                  >
                    Leaderboard
                  </Link>
                </motion.div>
              </motion.div>
            </motion.div>

            <motion.div
              className="w-full z-0 md:w-auto flex justify-center md:justify-start"
              animate={{
                y: [-10, 10, -10],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: [0.4, 0, 0.6, 1],
              }}
            >
              <Image
                src="https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExN2RraWV0aW8zcmJ6amhqeHM4ZzljNWNtcWw0OHdoM2QzYTBwN3Q2YiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/QsbWUyoB7YTO4ectTS/giphy.gif"
                alt="Hero Image"
                width={500}
                height={500}
                className="w-full max-w-[500px] sm:max-w-[500px] md:w-[500px] h-auto md:h-[500px] object-contain filter hue-rotate-240"
              />
            </motion.div>
          </section>

          {/* How It Works Section */}
          <section className="relative bg-[#0a0a0a]/80 backdrop-blur-xl py-12 sm:py-16 md:py-24 px-4 border-y-4 border-[#00E5FF]">
            <motion.div
              className="mx-auto max-w-6xl"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <motion.h2
                className="text-center font-venite text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-[#00E5FF] mb-8 sm:mb-10 md:mb-12 px-4"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                style={{ textShadow: '3px 3px 0 #000000' }}
              >
                How It Works?
              </motion.h2>

              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    num: "1",
                    title: "Draw Your Prediction",
                    desc: "You're shown a live market chart. Draw a path or curve representing your expected price trajectory over a fixed future horizon.",
                    Icon: PencilSquareIcon,
                  },
                  {
                    num: "2",
                    title: "Continuous Futures Position",
                    desc: "Your gesture is captured as a continuous curve, normalized to the chart's time and price scale, and interpolated using piecewise linear interpolation or cubic splines.",
                    Icon: ChartBarIcon,
                  },
                  {
                    num: "3",
                    title: "Calculate PnL",
                    desc: "The curve is interpreted as a continuous futures position where slope and deviation from the start price determine exposure, and PnL is computed via a discrete continuous-time PnL model.",
                    Icon: CurrencyDollarIcon,
                  },
                ].map((item, i) => {
                  const Icon = item.Icon;
                  return (
                    <motion.div
                      key={item.num}
                      className="relative p-6 sm:p-8 bg-[#000000]/60 border-4 border-[#00E5FF] rounded-2xl shadow-[6px_6px_0_0_#00E5FF]"
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.15 }}
                      whileHover={{
                        scale: 1.02,
                        x: -4,
                        y: -4,
                        boxShadow: '10px 10px 0 0 #00E5FF'
                      }}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <Icon className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 text-[#00E5FF]" aria-hidden />
                      </div>
                      <h3 className="mb-3 sm:mb-4 text-lg sm:text-xl font-bold text-[#00E5FF]">{item.title}</h3>
                      <p className="text-sm sm:text-base text-white/80">
                        {item.desc}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </section>

          {/* CTA Section */}
          <section className="relative overflow-hidden py-12 sm:py-16 md:py-24 px-4">
            <div className="absolute inset-0 z-0">
              <ColorBlends
                colors={["#ff5c7a", "#8a5cff", "#00ffd1"]}
                rotation={0}
                speed={0.2}
                scale={1}
                frequency={1}
                warpStrength={1}
                mouseInfluence={1}
                parallax={0.5}
                noise={0.1}
                transparent
                autoRotate={0}
                className="absolute inset-0 w-full h-full"
              />
            </div>
            <div className="absolute inset-0 z-1 bg-[#000000]/60 backdrop-blur-sm pointer-events-none" aria-hidden />
            <motion.div
              className="relative z-10 mx-auto max-w-3xl text-center"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <motion.h2
                className="mb-6 sm:mb-8 text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-venite font-bold text-[#00E5FF] px-4"
                style={{ textShadow: '3px 3px 0 #0a0a0a' }}
              >
                Ready to trade convictions?
              </motion.h2>
              <p className="mb-8 sm:mb-12 text-base sm:text-lg md:text-xl text-white/80 px-4">
                Draw your prediction curve and turn your market intuition into trading decisions.
              </p>
              <motion.div
                whileHover={{ scale: 1.05, x: -3, y: -3 }}
                whileTap={{ scale: 0.95, x: 3, y: 3 }}
                className="px-4"
              >
                <Link
                  href="/predict"
                  className="flex px-8 sm:px-12 py-4 sm:py-5 text-lg sm:text-xl font-bold text-[#000000] bg-[#00E5FF] border-4 border-[#0a0a0a] rounded-xl shadow-[8px_8px_0_0_#0a0a0a] transition-all hover:shadow-[10px_10px_0_0_#0a0a0a] items-center justify-center gap-2"
                >
                  Play Now
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 sm:h-7 sm:w-7 text-[#000000]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v16l16-8-16-8z" />
                  </svg>
                </Link>
              </motion.div>
            </motion.div>
          </section>
        </div>

        {/* Footer */}
        <div className="relative z-10">
          <Footer />
        </div>
      </div>
    </NoiseEffect >
  );
}
