'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

export function Footer() {
  return (
    <motion.footer
      className="relative bg-[#000000] border-t-4 border-[#00E5FF] py-8 mt-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo and branding */}
          <div className="flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Sketch Flow logo"
              width={40}
              height={40}
              style={{ imageRendering: 'pixelated' }}
            />
            <div>
              <h3 className="text-[#00E5FF] font-bold text-lg tracking-wider">SKETCH FLOW</h3>
              <p className="text-[#00E5FF]/60 text-xs">Draw Your Futures</p>
            </div>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
            >
              Home
            </Link>
            <Link
              href="/predict"
              className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
            >
              Predict
            </Link>
            <Link
              href="/open-position"
              className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
            >
              Positions
            </Link>
            <Link
              href="/pitch"
              className="text-[#00E5FF]/80 hover:text-[#00E5FF] text-sm font-semibold transition-colors"
            >
              Pitch
            </Link>
          </div>

          {/* Built with love */}
          <div className="text-[#00E5FF]/60 text-xs">
            Built with 🐱 on Ethereum
          </div>
        </div>
      </div>
    </motion.footer>
  );
}
