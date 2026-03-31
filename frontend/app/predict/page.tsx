'use client';

import { useEffect, useMemo, useState } from 'react';
import * as fcl from '@onflow/fcl';
import * as t from '@onflow/types';
import { motion, AnimatePresence } from 'framer-motion';
import { useNextStep } from 'nextstepjs';
import { TradingChart } from '@/components/chart/TradingChart';
import { PatternDrawingBox } from '@/components/chart/PatternDrawingBox';
import { usePredictionDrawing } from '@/hooks/usePredictionDrawing';
import { usePriceData } from '@/hooks/usePriceData';
import { useTokenPair } from '@/contexts/TokenPairContext';
import { TokenPairSelector } from '@/components/TokenPairSelector';
import {
  samplePredictionPoints,
  uploadSampledPredictionPoints,
} from '@/lib/prediction/samplePredictionPoints';
import { Header, BottomControls } from '@/components/layout';
import { NoiseEffect } from '@/components/ui/NoiseEffect';
import { useFlowWallet } from '@/hooks/useFlowWallet';
import { predictTourId } from '@/lib/onboarding/predictTourSteps';
import { getPosition } from '@/lib/api/positions';
import { fetchFlowBalanceDisplay } from '@/lib/flow/flowBalance';
import {
  buildBatchOpenPositionsCadence,
  buildOpenPositionCadence,
  flowAmountToUFix64String,
  sealAndExtractPositionIds,
} from '@/lib/flow/lineFuturesTx';
import { formatWeiLike18 } from '@/lib/formatWeiLike';
import { fetchFeeSponsorshipStatus } from '@/lib/flow/feeSponsorship';
import { createSponsorPayerAuthz } from '@/lib/flow/sponsorPayerAuthz';

const MIN_FLOW_PER_LEG = 0.001;

const ONBOARDING_SEEN_KEY = 'sketchflow-predict-onboarding-seen';

export const dynamic = 'force-dynamic';

export default function PredictPage(_props: { params?: unknown; searchParams?: unknown }) {
  const { ready, authenticated, address, isWalletLoading } = useFlowWallet();
  const isConnected = ready && authenticated && !!address && !isWalletLoading;
  const { selectedPair } = useTokenPair();
  const { startNextStep, isNextStepVisible } = useNextStep();

  useEffect(() => {
    if (typeof window === 'undefined' || isNextStepVisible) return;
    const seen = window.localStorage.getItem(ONBOARDING_SEEN_KEY);
    if (!seen) {
      startNextStep(predictTourId);
    }
  }, [startNextStep, isNextStepVisible]);

  const {
    isDrawing,
    currentPoints,
    startDrawing,
    addPoint,
    finishDrawing,
    clearPrediction,
  } = usePredictionDrawing();

  const { data: priceData } = usePriceData(selectedPair);

  useEffect(() => {
    clearPrediction();
    setSelectedMinute(null);
  }, [selectedPair]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when pair changes

  const [barSpacing, setBarSpacing] = useState(3);
  const [selectedMinute, setSelectedMinute] = useState<number | null>(null);
  const [amount, setAmount] = useState<number>(0.01);
  const [leverage, setLeverage] = useState<number>(500);
  const [positionIds, setPositionIds] = useState<number[]>([]);
  const [positionStatus, setPositionStatus] = useState<
    'idle' | 'trading' | 'awaiting_settlement' | 'closed'
  >('idle');
  const [batchPnL, setBatchPnL] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const [isOpeningPosition, setIsOpeningPosition] = useState(false);
  const [walletBalanceFlow, setWalletBalanceFlow] = useState('0.0000');
  const [walletBalanceLoading, setWalletBalanceLoading] = useState(false);
  const [feeSponsorship, setFeeSponsorship] = useState<Awaited<
    ReturnType<typeof fetchFeeSponsorshipStatus>
  > | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    void fetchFeeSponsorshipStatus().then(setFeeSponsorship);
  }, []);

  const sponsorPayerFactory = useMemo(() => {
    if (process.env.NEXT_PUBLIC_FLOW_SPONSOR_DISABLED === 'true') {
      return null;
    }
    if (!feeSponsorship?.enabled || !feeSponsorship.payerAddress) {
      return null;
    }
    if (feeSponsorship.apiKeyRequired && !process.env.NEXT_PUBLIC_FLOW_SPONSOR_API_KEY) {
      return null;
    }
    return createSponsorPayerAuthz({
      payerAddress: feeSponsorship.payerAddress,
      keyId: feeSponsorship.keyId ?? 0,
    });
  }, [feeSponsorship]);

  useEffect(() => {
    if (!isConnected || !address || typeof window === 'undefined') {
      setWalletBalanceFlow('0.0000');
      return;
    }
    let cancelled = false;
    setWalletBalanceLoading(true);
    fetchFlowBalanceDisplay(address)
      .then((b) => {
        if (!cancelled) {
          setWalletBalanceFlow(b);
          setWalletBalanceLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setWalletBalanceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, positionStatus, positionIds]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (positionIds.length === 0) return;

    let cancelled = false;
    let intervalId: number | null = null;

    const tradingMessages = ['Trading...', 'Future booming...', 'Position active...'] as const;

    const poll = async () => {
      if (cancelled) return;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        let anyOpen = false;
        let anyAwaiting = false;
        let minRemaining: number | null = null;
        let totalClosedPnlWei = 0n;
        let fetchedCount = 0;

        for (const pid of positionIds) {
          try {
            const { position } = await getPosition(pid, {
              includeAnalytics: false,
              includePredictions: false,
            });
            fetchedCount += 1;
            if (position.isOpen) {
              anyOpen = true;
              const openTimestampSec = Math.floor(Number(position.openTimestamp));
              const closeAt = openTimestampSec + 60;
              const remaining = closeAt - nowSec;
              if (minRemaining === null || remaining < minRemaining) {
                minRemaining = remaining;
              }
              if (nowSec >= closeAt) {
                anyAwaiting = true;
              }
            } else {
              totalClosedPnlWei += BigInt(String(position.pnl));
            }
          } catch (getErr: unknown) {
            const msg = getErr instanceof Error ? getErr.message : String(getErr);
            if (msg.includes('not found') || msg.includes('404')) {
              console.warn('Position not found via API (indexing or network).', { positionId: pid });
            } else {
              console.warn('Error fetching position', pid, getErr);
            }
          }
        }

        if (fetchedCount === 0) {
          return;
        }

        setBatchPnL(parseFloat(formatWeiLike18(totalClosedPnlWei)));

        if (anyOpen) {
          setPositionStatus(anyAwaiting ? 'awaiting_settlement' : 'trading');
          setTimeRemaining(minRemaining !== null && minRemaining > 0 ? minRemaining : 0);
        } else {
          setPositionStatus('closed');
          setTimeRemaining(0);
          if (intervalId !== null) {
            clearInterval(intervalId);
          }
        }

        setStatusMessageIndex((prev) => (prev + 1) % tradingMessages.length);
      } catch (err) {
        console.error('Error polling position status', err);
      }
    };

    poll();
    intervalId = window.setInterval(poll, 3000);

    return () => {
      cancelled = true;
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [positionIds]);

  const handleClear = () => {
    clearPrediction();
    setSelectedMinute(null);
  };

  const handleZoomIn = () => {
    setBarSpacing((prev) => Math.min(prev + 0.5, 10));
  };

  const handleZoomOut = () => {
    setBarSpacing((prev) => Math.max(prev - 0.5, 0.1));
  };

  const handlePatternComplete = async (
    points: Array<{ x: number; y: number }>,
    offsetMinutes: number,
  ) => {
    if (!priceData || priceData.length === 0) {
      alert('Price data is still loading. Please wait for the chart to connect and try again.');
      return;
    }
    if (points.length === 0) {
      alert('Please draw a pattern with at least 2 points before pulling the lever.');
      return;
    }

    const currentPrice = priceData[priceData.length - 1].value;

    const canvasWidth = 600;
    const canvasHeight = 300;

    const priceRange = currentPrice * 0.05;
    const minPrice = currentPrice - priceRange;
    const maxPrice = currentPrice + priceRange;

    const nowInSeconds = Math.floor(Date.now() / 1000);
    const futureStartTime = nowInSeconds;
    const totalDurationSeconds = offsetMinutes * 60;

    let sampledPoints: Array<{ x: number; y: number }>;
    try {
      sampledPoints = samplePredictionPoints(points, 60);
      console.log('sampled prediction canvas points (60):', sampledPoints);
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Not enough points to sample the required number of predictions';
      console.error('sampling error:', err);
      alert(
        message.includes('Not enough points')
          ? 'Please draw a longer pattern so we can sample at least 60 points.'
          : `Error sampling prediction points: ${message}`,
      );
      return;
    }

    if (!isConnected || !address) {
      alert('Please connect your Flow wallet to open a position.');
      return;
    }

    setIsOpeningPosition(true);
    try {
      const commitmentIds: string[] = [];
      try {
        for (let i = 0; i < offsetMinutes; i++) {
          const { commitmentId } = await uploadSampledPredictionPoints({
            points,
            userAddress: address,
            desiredCount: 60,
          });
          console.log(`prediction commitment from backend [${i}]:`, commitmentId);
          commitmentIds.push(commitmentId);
        }
      } catch (err) {
        console.error('failed to upload sampled prediction points', err);
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Prediction upload failed';
        alert(`Error uploading predictions: ${message}`);
        return;
      }

      const lev = Number(leverage);
      if (!Number.isFinite(lev) || lev < 1 || lev > 2500) {
        alert('Leverage must be between 1 and 2500');
        return;
      }
      const amt = Number(amount);
      if (!Number.isFinite(amt) || amt < MIN_FLOW_PER_LEG) {
        alert(`Stake must be at least ${MIN_FLOW_PER_LEG} FLOW per leg.`);
        return;
      }

      const filteredIds = commitmentIds.filter((c) => c?.trim());
      if (filteredIds.length === 0) {
        alert('No valid prediction commitments.');
        return;
      }

      let cadence: string;
      let args: (arg: (value: string, type: unknown) => unknown, types: typeof t) => unknown[];

      try {
        if (filteredIds.length === 1) {
          cadence = buildOpenPositionCadence();
          const flowAmountStr = flowAmountToUFix64String(amt);
          args = (arg, types) => [
            arg(String(lev), types.UInt16),
            arg(filteredIds[0], types.String),
            arg(flowAmountStr, types.UFix64),
          ];
        } else {
          cadence = buildBatchOpenPositionsCadence();
          const totalFlow = amt * filteredIds.length;
          const flowAmountStr = flowAmountToUFix64String(totalFlow);
          args = (arg, types) => [
            arg(String(lev), types.UInt16),
            (arg as (val: unknown, type: unknown) => unknown)(
              filteredIds,
              types.Array(types.String),
            ),
            arg(flowAmountStr, types.UFix64),
          ];
        }
      } catch (cfgErr) {
        const msg = cfgErr instanceof Error ? cfgErr.message : String(cfgErr);
        alert(msg);
        return;
      }

      let txId: string;
      try {
        if (sponsorPayerFactory) {
          txId = await fcl.mutate({
            cadence,
            args,
            proposer: fcl.authz,
            payer: sponsorPayerFactory,
            authorizations: [fcl.authz],
            limit: 9999,
          });
        } else {
          txId = await fcl.mutate({
            cadence,
            args,
            limit: 9999,
          });
        }
      } catch (err) {
        console.error('open position failed', err);
        const message = err instanceof Error ? err.message : 'Failed to open position';
        const low =
          message.toLowerCase().includes('insufficient') ||
          message.toLowerCase().includes('below minimum') ||
          message.toLowerCase().includes('min_amount');
        alert(
          low
            ? `Check your FLOW balance and minimum stake (${MIN_FLOW_PER_LEG} FLOW per leg).`
            : `Error: ${message}`,
        );
        return;
      }

      let openedIds: number[];
      try {
        openedIds = await sealAndExtractPositionIds(txId);
      } catch (sealErr) {
        console.error(sealErr);
        alert('Transaction submitted but confirmation failed. Check the explorer for your wallet.');
        return;
      }

      if (openedIds.length === 0) {
        alert(
          'Transaction sealed but no PositionOpened events were found. Check NEXT_PUBLIC_FLOW_LINE_FUTURES_ADDRESS and network.',
        );
        return;
      }

      setPositionIds(openedIds);
      setPositionStatus('trading');
      setTimeRemaining(60);
      setBatchPnL(null);

      const predictionPoints = sampledPoints.map((point) => {
        const normalizedX = point.x / canvasWidth;
        const time = futureStartTime + normalizedX * totalDurationSeconds;

        const normalizedY = point.y / canvasHeight;
        const price = maxPrice - normalizedY * (maxPrice - minPrice);

        return {
          x: 0,
          y: 0,
          time: Math.floor(time),
          price,
          canvasX: point.x,
          canvasY: point.y,
        };
      });

      clearPrediction();
      setSelectedMinute(offsetMinutes);

      startDrawing(predictionPoints[0]);
      for (let i = 1; i < predictionPoints.length; i++) {
        addPoint(predictionPoints[i]);
      }
      finishDrawing();
    } finally {
      setIsOpeningPosition(false);
    }
  };

  return (
    <div className="text-white pb-24 relative overflow-hidden">
      <Header
        showStatus={currentPoints.length > 0}
        statusText={selectedMinute ? `+${selectedMinute}m` : undefined}
      />

      <motion.div
        className="relative z-10 px-3 py-4 sm:px-4 sm:py-6 mb-20 max-w-7xl mx-auto space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <motion.section
          id="onboard-token-pair"
          className="mb-4"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex flex-col gap-4 w-full">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex flex-col items-start text-left">
                <p className="text-sm font-medium text-[#00E5FF]/90">
                  Choose the market you want to predict
                </p>
                <p className="text-xs text-white/60 max-w-md">
                  Select a token pair below. The chart and your prediction will use this market.
                </p>
              </div>
              <TokenPairSelector />
            </div>
          </div>
        </motion.section>

        <NoiseEffect opacity={0.7} className="">
          <motion.div
            id="onboard-chart"
            className="relative group"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <div className="absolute -inset-1 bg-gradient-to-r from-[#00E5FF] via-[#000000] to-[#00E5FF] rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500 animate-pulse" />

            <div className="relative bg-[#0a0a0a] rounded-2xl border-4 border-[#00E5FF] p-3 sm:p-4 overflow-hidden shadow-[6px_6px_0_0_#000000]">
              <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/20 to-transparent pointer-events-none" />

              <AnimatePresence>
                {isDrawing && (
                  <motion.div
                    className="absolute top-3 right-3 z-20 flex items-center gap-2 px-3 py-1.5 bg-[#00E5FF] rounded-full shadow-[2px_2px_0_0_#000000]"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                  >
                    <motion.div
                      className="w-1.5 h-1.5 rounded-full bg-[#000000]"
                      animate={{ scale: [1, 1.5, 1] }}
                      transition={{ repeat: Infinity, duration: 0.5 }}
                    />
                    <span className="text-[11px] font-bold text-[#000000] uppercase tracking-wider">
                      Live
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              <TradingChart
                key={selectedPair}
                isDark={true}
                isDrawing={isDrawing}
                isConfirmed={false}
                currentPoints={currentPoints}
                selectedMinute={selectedMinute}
                onStartDrawing={startDrawing}
                onAddPoint={addPoint}
                onFinishDrawing={finishDrawing}
                barSpacing={barSpacing}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
              />
            </div>
          </motion.div>
        </NoiseEffect>

        <NoiseEffect opacity={0.5} className="">
          <motion.div
            id="onboard-draw-box"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <PatternDrawingBox
              onPatternComplete={handlePatternComplete}
              amount={amount}
              leverage={leverage}
              onAmountChange={(amt: number) => setAmount(amt)}
              onLeverageChange={(lev) => setLeverage(lev)}
              isOpeningPosition={isOpeningPosition}
            />
          </motion.div>
        </NoiseEffect>
      </motion.div>

      <BottomControls
        selectedMinute={selectedMinute}
        hasPoints={currentPoints.length > 0}
        onClear={handleClear}
        isConnected={isConnected}
        batchPnL={batchPnL}
        walletBalanceFlow={walletBalanceFlow}
        walletBalanceLoading={walletBalanceLoading}
        isOpeningPosition={isOpeningPosition}
        positionStatus={positionStatus}
        statusMessageIndex={statusMessageIndex}
        timeRemaining={timeRemaining}
      />
    </div>
  );
}
