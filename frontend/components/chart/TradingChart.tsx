'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { usePriceData } from '@/hooks/usePriceData';
import { useTokenPair } from '@/contexts/TokenPairContext';
import { ChartCanvas, ChartCanvasRef } from './ChartCanvas';
import { PredictionOverlay } from './PredictionOverlay';
import { NyanCat, RainbowPathTrail } from './NyanCat';
import type { PredictionPoint, DirectionalMatch, DirectionalScore, PNLConfig } from '@/types/prediction';
import type { PricePoint } from '@/types/price';
import type { Time } from 'lightweight-charts';

interface TradingChartProps {
  isDark?: boolean;
  isDrawing: boolean;
  isConfirmed: boolean;
  currentPoints: PredictionPoint[];
  selectedMinute?: number | null; // Which future minute to draw on
  onStartDrawing: (point: PredictionPoint) => void;
  onAddPoint: (point: PredictionPoint) => void;
  onFinishDrawing: () => void;
  barSpacing?: number;
  onPriceRangeReady?: (currentPrice: number, priceRange: number) => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
}

export function TradingChart({
  isDark = false,
  isDrawing,
  isConfirmed,
  currentPoints,
  selectedMinute,
  onStartDrawing,
  onAddPoint,
  onFinishDrawing,
  barSpacing = 0.5,
  onZoomIn,
  onZoomOut,
}: TradingChartProps) {
  const chartRef = useRef<ChartCanvasRef>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { selectedPair, availablePairs } = useTokenPair();
  const { data, isLoading, error } = usePriceData(selectedPair);

  // Get display name for the selected pair
  const selectedPairData = availablePairs.find(p => p.symbol === selectedPair);
  const pairDisplayName = selectedPairData?.display || selectedPair.replace('USDT', '/USDT');
  const [overlapPoints, setOverlapPoints] = useState<Array<{ time: number; price: number }>>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [nyanPosition, setNyanPosition] = useState<{ x: number; y: number } | null>(null);
  const [rainbowTrailPoints, setRainbowTrailPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [isMobile, setIsMobile] = useState(false);

  // Directional accuracy state
  const [directionalMatches, setDirectionalMatches] = useState<DirectionalMatch[]>([]);
  const [directionalScore, setDirectionalScore] = useState<DirectionalScore>({
    correctDirections: 0,
    totalDirections: 0,
    accuracy: 0,
    pnl: 0,
    fee: 0,
    finalAmount: 0,
    maxProfit: 0,
  });

  // PNL configuration - can be made user-configurable later
  const [pnlConfig] = useState<PNLConfig>({
    amount: 0.01,      // 0.01 ETH default (above MIN_AMOUNT 0.001)
    leverage: 10,      // 10x default leverage
    feePercentage: 200 // 2% fee (matches backend)
  });

  // Check for mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // sm breakpoint
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Track client-side mounting to avoid hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Get current time from latest data point
  const currentTime = data.length > 0 ? data[data.length - 1].time : undefined;
  const currentPrice = data.length > 0 ? data[data.length - 1].value : null;

  // Update Nyan Cat position and rainbow trail based on price data
  useEffect(() => {
    if (!chartRef.current?.chart || !chartRef.current?.series || data.length === 0) {
      return;
    }

    const updatePositions = () => {
      try {
        const chart = chartRef.current?.chart;
        const series = chartRef.current?.series;
        const chartContainer = chartRef.current?.container;
        if (!chart || !series || !chartContainer) return;

        const timeScale = chart.timeScale();

        // Get the chart container's position relative to its parent
        const chartRect = chartContainer.getBoundingClientRect();
        const parentElement = chartContainer.parentElement;
        if (!parentElement) return;

        const parentRect = parentElement.getBoundingClientRect();
        const offsetX = chartRect.left - parentRect.left;
        const offsetY = chartRect.top - parentRect.top;

        // Convert ALL price points to pixel coordinates for the rainbow trail
        const trailPoints: Array<{ x: number; y: number }> = [];
        for (const point of data) {
          const x = timeScale.timeToCoordinate(point.time as Time);
          const y = series.priceToCoordinate(point.value);
          if (x !== null && y !== null) {
            trailPoints.push({ x: x + offsetX, y: y + offsetY });
          }
        }
        setRainbowTrailPoints(trailPoints);

        // Position cat at the latest price point
        if (trailPoints.length > 0) {
          const lastPoint = trailPoints[trailPoints.length - 1];
          setNyanPosition({ x: lastPoint.x, y: lastPoint.y });
        }
      } catch (e) {
        // Chart not ready yet
      }
    };

    // Update immediately and on scroll/zoom
    updatePositions();

    const interval = setInterval(updatePositions, 50);

    // Also update on visible range changes
    const handleVisibleRangeChange = () => {
      updatePositions();
    };

    if (chartRef.current?.chart) {
      chartRef.current.chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    }

    return () => {
      clearInterval(interval);
      if (chartRef.current?.chart) {
        chartRef.current.chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
      }
    };
  }, [data]);


  // Interpolate prediction curve to get predicted price at a specific time
  const interpolatePrediction = useCallback((time: number, points: PredictionPoint[]): number | null => {
    if (points.length === 0) return null;

    // Sort points by time to ensure correct interpolation
    const sortedPoints = [...points].sort((a, b) => a.time - b.time);

    // Check if time is outside prediction range
    if (time < sortedPoints[0].time || time > sortedPoints[sortedPoints.length - 1].time) {
      return null;
    }

    // Find the two points to interpolate between
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const p1 = sortedPoints[i];
      const p2 = sortedPoints[i + 1];

      if (time >= p1.time && time <= p2.time) {
        // Linear interpolation
        const t = (time - p1.time) / (p2.time - p1.time);
        const predictedPrice = p1.price + (p2.price - p1.price) * t;
        return predictedPrice;
      }
    }

    return null;
  }, []);

  // Calculate directional accuracy - mirrors backend formula
  const calculateDirectionalAccuracy = useCallback(() => {
    if (currentPoints.length < 2 || data.length === 0 || currentTime === undefined) {
      setDirectionalMatches([]);
      setDirectionalScore({
        correctDirections: 0,
        totalDirections: 0,
        accuracy: 0,
        pnl: 0,
        fee: 0,
        finalAmount: 0,
        maxProfit: 0,
      });
      return;
    }

    // Sort prediction points by time
    const sortedPredictionPoints = [...currentPoints].sort((a, b) => a.time - b.time);

    if (sortedPredictionPoints.length < 2) {
      return;
    }

    // Helper: Get direction (mirrors backend logic)
    const getDirection = (price1: number, price2: number): number => {
      if (price2 > price1) return 1;   // UP
      if (price2 < price1) return -1;  // DOWN
      return 0;                         // UNCHANGED
    };

    // Helper: Find actual price at timestamp (with tolerance)
    const getActualPrice = (targetTime: number): number | undefined => {
      return data.find(p => Math.abs(p.time - targetTime) <= 1)?.value;
    };

    const matches: DirectionalMatch[] = [];
    let correctCount = 0;
    let totalCount = 0;

    // Compare consecutive prediction points (mirrors backend's 59 comparisons)
    for (let i = 0; i < sortedPredictionPoints.length - 1; i++) {
      const predPoint1 = sortedPredictionPoints[i];
      const predPoint2 = sortedPredictionPoints[i + 1];

      // Calculate predicted direction
      const predictedDirection = getDirection(predPoint1.price, predPoint2.price);

      // Find actual prices at these timestamps
      const actualPrice1 = getActualPrice(predPoint1.time);
      const actualPrice2 = getActualPrice(predPoint2.time);

      // Only compare if we have both actual prices (time has passed)
      if (actualPrice1 !== undefined && actualPrice2 !== undefined) {
        const actualDirection = getDirection(actualPrice1, actualPrice2);

        totalCount++;

        // Check if directions match
        const isMatch = predictedDirection === actualDirection;
        if (isMatch) {
          correctCount++;

          // Store match point for visualization (midpoint)
          const matchTime = (predPoint1.time + predPoint2.time) / 2;
          const matchPrice = (actualPrice1 + actualPrice2) / 2;

          matches.push({
            time: matchTime,
            price: matchPrice,
            predictedDirection,
            actualDirection,
          });
        }
      }
    }

    // Calculate accuracy
    const accuracy = totalCount > 0 ? correctCount / totalCount : 0;

    // Calculate PNL using backend formula
    if (totalCount > 0 && data.length > 0) {
      // Get initial and final actual prices
      const initialPrice = data[0].value;
      const finalPrice = data[data.length - 1].value;

      // Position size calculation
      const positionSize = pnlConfig.amount / initialPrice;

      // Price movement (absolute)
      const priceMovement = Math.abs(finalPrice - initialPrice);

      // Max profit calculation
      const maxProfit = priceMovement * positionSize * pnlConfig.leverage;

      // PNL formula: (2 × Acc - 1) × Pₘₐₓ
      // 50% accuracy = 0 PNL (breakeven)
      // 100% accuracy = +Pₘₐₓ (full profit)
      // 0% accuracy = -Pₘₐₓ (full loss)
      const pnl = (2 * accuracy - 1) * maxProfit;

      // Fee calculation (only on profits)
      const fee = pnl > 0 ? (pnl * pnlConfig.feePercentage) / 10000 : 0;

      // Final amount
      const finalAmount = pnlConfig.amount + pnl - fee;

      setDirectionalScore({
        correctDirections: correctCount,
        totalDirections: totalCount,
        accuracy,
        pnl,
        fee,
        finalAmount: Math.max(0, finalAmount),
        maxProfit,
      });
    }

    setDirectionalMatches(matches);
  }, [currentPoints, data, currentTime, pnlConfig]);

  // Detect overlap between prediction and actual prices
  useEffect(() => {
    if (currentPoints.length === 0 || data.length === 0 || currentTime === undefined) {
      setOverlapPoints([]);
      return;
    }

    // Sort prediction points by time
    const sortedPredictionPoints = [...currentPoints].sort((a, b) => a.time - b.time);
    const predictionStartTime = sortedPredictionPoints[0]?.time;
    const predictionEndTime = sortedPredictionPoints[sortedPredictionPoints.length - 1]?.time;

    if (!predictionStartTime || !predictionEndTime) {
      setOverlapPoints([]);
      return;
    }

    const overlaps: Array<{ time: number; price: number }> = [];
    const priceTolerance = 0.005; // 0.5% price tolerance (tighter)
    const minTimeGap = 5; // Minimum 5 seconds between overlap marks (prevents excessive marking)

    // Filter data to only check points that are in the prediction time range
    // We check all prices within the prediction window, regardless of current time
    const relevantData = data.filter((p) =>
      p.time >= predictionStartTime &&
      p.time <= predictionEndTime
    );

    let lastMarkedTime: number | null = null;

    // Track previous state to detect crossings
    let prevActualPrice: number | null = null;
    let prevPredictedPrice: number | null = null;

    for (const pricePoint of relevantData) {
      const predictedPrice = interpolatePrediction(pricePoint.time, sortedPredictionPoints);

      if (predictedPrice === null) continue;

      const priceDiff = Math.abs(predictedPrice - pricePoint.value);
      const pricePercent = priceDiff / pricePoint.value;

      // Detect if price is close to prediction
      const isClose = pricePercent < priceTolerance;

      // Detect crossing: price goes from above to below or vice versa
      let isCrossing = false;
      if (prevActualPrice !== null && prevPredictedPrice !== null) {
        const wasAbove = prevActualPrice > prevPredictedPrice;
        const isAbove = pricePoint.value > predictedPrice;
        isCrossing = wasAbove !== isAbove;
      }

      // Mark overlap if:
      // 1. Price is close to prediction AND
      // 2. (It's a crossing OR it's the first point close to prediction) AND
      // 3. Enough time has passed since last mark
      if (isClose && (isCrossing || lastMarkedTime === null) &&
        (lastMarkedTime === null || (pricePoint.time - lastMarkedTime) >= minTimeGap)) {
        overlaps.push({
          time: pricePoint.time,
          price: pricePoint.value,
        });
        lastMarkedTime = pricePoint.time;
      }

      prevActualPrice = pricePoint.value;
      prevPredictedPrice = predictedPrice;
    }

    setOverlapPoints(overlaps);
  }, [currentPoints, data, currentTime, interpolatePrediction]);

  // Calculate directional accuracy in real-time
  useEffect(() => {
    calculateDirectionalAccuracy();
  }, [calculateDirectionalAccuracy, currentPoints, data, currentTime]);

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-[250px] sm:h-[300px] md:h-[350px] bg-[#0a0a0a] rounded-lg border-2 border-[#00E5FF]/30">
        <div className="text-center px-4">
          <p className="text-red-500 mb-2 text-sm">Error loading price data</p>
          <p className="text-xs text-[#00E5FF]/60">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading && data.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-[250px] sm:h-[300px] md:h-[350px] bg-[#0a0a0a] rounded-lg border-2 border-[#00E5FF]/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-10 sm:w-10 border-b-2 border-[#00E5FF] mx-auto mb-3" />
          <p className="text-[#00E5FF]/60 text-xs sm:text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Current Price Display + Zoom - Top Left (only after hydration to avoid mismatch) */}
      {isMounted && currentPrice && (
        <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5">
          <div className="flex items-center gap-1.5 bg-black backdrop-blur px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg border-2 border-[#00E5FF] shadow-[2px_2px_0_0_#00E5FF]">
            <span className="text-xs">
              {pairDisplayName}
            </span>
            <span className="text-[#00E5FF] font-venite font-bold text-sm sm:text-base">
              ${currentPrice.toFixed(4)}
            </span>
          </div>
          {onZoomIn && onZoomOut && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={onZoomOut}
                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-[#0a0a0a] border-2 border-[#00E5FF] rounded-lg text-[#00E5FF] text-base font-bold shadow-[2px_2px_0_0_#00E5FF] hover:opacity-90 active:scale-95"
                aria-label="Zoom out"
              >
                −
              </button>
              <button
                type="button"
                onClick={onZoomIn}
                className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-[#0a0a0a] border-2 border-[#00E5FF] rounded-lg text-[#00E5FF] text-base font-bold shadow-[2px_2px_0_0_#00E5FF] hover:opacity-90 active:scale-95"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      <div className="relative" style={{ position: 'relative', zIndex: 1 }}>
        <ChartCanvas ref={chartRef} data={data} isDark={isDark} barSpacing={barSpacing} />
        <PredictionOverlay
          chartRef={chartRef as React.RefObject<{ chart: any; series: any }>}
          catPosition={nyanPosition}
          isDrawing={isDrawing}
          isConfirmed={isConfirmed}
          points={currentPoints}
          overlapPoints={overlapPoints}
          directionalMatches={directionalMatches}
          currentTime={currentTime}
          currentPrice={currentPrice ?? undefined}
          selectedMinute={selectedMinute}
          onStartDrawing={onStartDrawing}
          onAddPoint={onAddPoint}
          onFinishDrawing={onFinishDrawing}
        />
        {/* Rainbow trail on price line behind the cat */}
        {isMounted && rainbowTrailPoints.length > 1 && nyanPosition && (
          <RainbowPathTrail
            points={rainbowTrailPoints}
            catX={nyanPosition.x}
            strokeWidth={isMobile ? 10 : 14}
          />
        )}

        {/* Nyan Cat at current price */}
        {isMounted && nyanPosition && (
          <NyanCat
            x={nyanPosition.x}
            y={nyanPosition.y - 22}
            size={isMobile ? 0.35 : 0.35}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Real-time Score Display - matches backend formula */}
      {directionalScore.totalDirections > 0 && (
        <div className="absolute bottom-4 left-4 flex flex-col gap-2 z-30">
          {/* Directional Accuracy Score */}
          <div className="bg-[#000000]/90 backdrop-blur px-4 py-2 rounded-lg shadow-[3px_3px_0_0_#00E5FF] border-2 border-[#00E5FF]">
            <div className="text-xs font-bold text-[#00E5FF]/80 uppercase tracking-wide">Directional Accuracy</div>
            <div className="text-lg font-bold text-[#00E5FF]">
              {directionalScore.correctDirections}/{directionalScore.totalDirections}
              <span className="text-sm ml-2">({(directionalScore.accuracy * 100).toFixed(1)}%)</span>
            </div>
          </div>

          {/* Max Profit Info */}
          <div className="bg-[#0a0a0a]/90 backdrop-blur px-4 py-2 rounded-lg text-xs shadow-[2px_2px_0_0_#00E5FF] border-2 border-[#00E5FF]/50">
            <div className="text-[#00E5FF]/90">Max Profit: {directionalScore.maxProfit.toFixed(4)} ETH</div>
            <div className="text-[#00E5FF]/60 mt-1">
              {pnlConfig.amount} ETH × {pnlConfig.leverage}x leverage
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
