'use client';

import { useRef, useCallback, MouseEvent, useState, useEffect } from 'react';
import type { IChartApi, ISeriesApi, Time } from 'lightweight-charts';
import type { PredictionPoint, DirectionalMatch } from '@/types/prediction';
import './nyan-cat.css';

const rainbowColors = [
  '#ff0000', // Red
  '#ff9900', // Orange
  '#ffff00', // bright trace
  '#33ff00', // Green
  '#0099ff', // Blue
  '#6633ff', // Purple
];

interface PredictionOverlayProps {
  chartRef: React.RefObject<{
    chart: IChartApi | null;
    series: ISeriesApi<any> | null;
  }>;
  catPosition?: { x: number; y: number } | null;
  isDrawing: boolean;
  isConfirmed: boolean;
  points: PredictionPoint[];
  overlapPoints?: Array<{ time: number; price: number }>;
  directionalMatches?: DirectionalMatch[];
  currentTime?: number; // Current time from latest price data
  currentPrice?: number; // Current price for calculating Y coordinates
  selectedMinute?: number | null; // Which future minute to draw on
  onStartDrawing: (point: PredictionPoint) => void;
  onAddPoint: (point: PredictionPoint) => void;
  onFinishDrawing: () => void;
}

export function PredictionOverlay({
  chartRef,
  catPosition,
  isDrawing,
  isConfirmed,
  points,
  overlapPoints = [],
  directionalMatches = [],
  currentTime,
  currentPrice,
  selectedMinute,
  onStartDrawing,
  onAddPoint,
  onFinishDrawing,
}: PredictionOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Calculate the time range for the selected minute
  const getDrawingTimeRange = useCallback(() => {
    if (!currentTime || !selectedMinute) return null;

    const startTime = currentTime + (selectedMinute * 60); // Start of selected minute
    const endTime = startTime + 60; // End of selected minute

    return { startTime, endTime };
  }, [currentTime, selectedMinute]);

  const convertToChartCoordinates = useCallback(
    (clientX: number, clientY: number): PredictionPoint | null => {
      if (!svgRef.current) return null;

      const rect = svgRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      // Try to get chart coordinates if available
      if (chartRef.current?.chart && chartRef.current?.series) {
        try {
          const timeScale = chartRef.current.chart.timeScale();
          const time = timeScale.coordinateToTime(x);
          const logicalPrice = chartRef.current.series.coordinateToPrice(y);

          if (time !== null && logicalPrice !== null) {
            const timeNum = time as number;

            // Check if time is within selected minute range
            const timeRange = getDrawingTimeRange();
            if (timeRange) {
              // Only allow drawing within the selected minute
              if (timeNum < timeRange.startTime || timeNum > timeRange.endTime) {
                return null; // Outside selected minute, reject
              }
            }

            return {
              x,
              y,
              time: timeNum,
              price: logicalPrice,
            };
          }
        } catch (error) {
          console.error('Error converting coordinates:', error);
        }
      }

      return null; // No fallback - require proper chart coordinates
    },
    [chartRef, getDrawingTimeRange]
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (isConfirmed || !selectedMinute) return; // Must have selected minute

      const point = convertToChartCoordinates(e.clientX, e.clientY);
      if (!point) return; // Point outside selected minute range

      onStartDrawing(point);
    },
    [isConfirmed, selectedMinute, convertToChartCoordinates, onStartDrawing]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<SVGSVGElement>) => {
      if (!isDrawing || isConfirmed) return;

      const point = convertToChartCoordinates(e.clientX, e.clientY);
      if (!point) return;

      // Validate: X must always increase (no backtracking)
      if (points.length > 0) {
        const lastPoint = points[points.length - 1];
        if (point.x <= lastPoint.x) {
          // Skip this point - only allow forward movement
          return;
        }
      }

      onAddPoint(point);
    },
    [isDrawing, isConfirmed, points, convertToChartCoordinates, onAddPoint]
  );

  const handleMouseUp = useCallback(
    () => {
      if (isDrawing && !isConfirmed) {
        onFinishDrawing();
      }
    },
    [isDrawing, isConfirmed, onFinishDrawing]
  );

  // Convert prediction point to pixel coordinates, preserving exact drawn shape
  const convertToPixelCoordinates = useCallback(
    (point: PredictionPoint, allPoints: PredictionPoint[]): { x: number; y: number } | null => {
      if (!chartRef.current?.chart || !svgRef.current) {
        return null;
      }

      try {
        const timeScale = chartRef.current.chart.timeScale();
        const chartWidth = svgRef.current.clientWidth;
        const chartHeight = svgRef.current.clientHeight;

        // If we have original canvas coordinates, use them to preserve exact shape
        if (point.canvasX !== undefined && point.canvasY !== undefined && allPoints.length > 0) {
          // Find the X position where the drawing should start (based on first point's time)
          const firstPoint = allPoints[0];
          const visibleRange = timeScale.getVisibleRange();

          if (visibleRange && firstPoint.time) {
            const timeRangeWidth = (visibleRange.to as number) - (visibleRange.from as number);
            const firstPointOffset = firstPoint.time - (visibleRange.from as number);
            const startX = (firstPointOffset / timeRangeWidth) * chartWidth;

            // Match PatternDrawingBox canvas: 600x300
            const canvasWidth = 600;
            const canvasHeight = 300;

            // Scale factor: fit the drawing within a reasonable portion of the chart
            // Use the time range to determine X scale
            const drawingDuration = 60; // 1 minute of drawing
            const drawingWidthOnChart = (drawingDuration / timeRangeWidth) * chartWidth;
            const scaleX = drawingWidthOnChart / canvasWidth;

            // Use same scale for Y to maintain aspect ratio
            const scaleY = scaleX;

            // Calculate X: offset from first point's canvas position + start position
            const relativeCanvasX = point.canvasX - (firstPoint.canvasX ?? 0);
            const xCoord = startX + (relativeCanvasX * scaleX);

            // Calculate Y: center the drawing vertically on the chart (canvas middle = 150)
            const canvasMidY = canvasHeight / 2;
            const chartMidY = chartHeight / 2;
            const relativeCanvasY = point.canvasY - canvasMidY;
            const yCoord = chartMidY + (relativeCanvasY * scaleY);

            return { x: xCoord, y: yCoord };
          }
        }

        // Fallback: use time/price so the prediction line appears at correct price level
        const visibleRange = timeScale.getVisibleRange();
        const series = chartRef.current.series;
        if (visibleRange && series) {
          const timeRangeWidth = (visibleRange.to as number) - (visibleRange.from as number);
          const timeOffset = point.time - (visibleRange.from as number);
          const xCoord = (timeOffset / timeRangeWidth) * chartWidth;
          const yCoord = series.priceToCoordinate(point.price) ?? chartHeight / 2;
          return { x: xCoord, y: yCoord };
        }

        return null;
      } catch (error) {
        console.error('Error converting coordinates:', error);
        return null;
      }
    },
    [chartRef]
  );

  // Generate smooth Catmull-Rom spline curve like the reference image
  // When not drawing, anchors path to cat position so rainbow trails behind cat
  const generateSmoothPath = useCallback((points: PredictionPoint[], anchorToCat: boolean = false): string => {
    if (points.length === 0) return '';

    // Convert all points to current pixel coordinates, passing all points for reference
    const pixelPoints = points
      .map(p => convertToPixelCoordinates(p, points))
      .filter(p => p !== null) as { x: number; y: number }[];

    if (pixelPoints.length === 0) return '';

    // Anchor path to cat position when not drawing (rainbow trails behind cat)
    const anchoredPoints =
      anchorToCat && catPosition
        ? [{ x: catPosition.x, y: catPosition.y }, ...pixelPoints]
        : pixelPoints;

    if (anchoredPoints.length === 1) return `M ${anchoredPoints[0].x},${anchoredPoints[0].y}`;
    if (anchoredPoints.length === 2)
      return `M ${anchoredPoints[0].x},${anchoredPoints[0].y} L ${anchoredPoints[1].x},${anchoredPoints[1].y}`;

    // Sample points for smooth curve
    const sampledPoints = [];
    const sampleRate = Math.max(1, Math.floor(anchoredPoints.length / 20)); // Sample every N points
    for (let i = 0; i < anchoredPoints.length; i += sampleRate) {
      sampledPoints.push(anchoredPoints[i]);
    }
    if (sampledPoints[sampledPoints.length - 1] !== anchoredPoints[anchoredPoints.length - 1]) {
      sampledPoints.push(anchoredPoints[anchoredPoints.length - 1]);
    }

    // Generate smooth Bezier curve path
    let d = `M ${sampledPoints[0].x},${sampledPoints[0].y}`;

    for (let i = 0; i < sampledPoints.length - 1; i++) {
      const current = sampledPoints[i];
      const next = sampledPoints[i + 1];

      // Use quadratic bezier for smoothness
      const cp1x = current.x + (next.x - current.x) / 2;
      const cp1y = current.y + (next.y - current.y) / 2;

      d += ` Q ${cp1x},${cp1y} ${next.x},${next.y}`;
    }

    return d;
  }, [catPosition, convertToPixelCoordinates]);

  // Get control points to display (start, middle, end)
  const getControlPoints = useCallback((points: PredictionPoint[]) => {
    if (points.length === 0) return [];

    // Select which points to show as control points
    let selectedPoints: PredictionPoint[];
    if (points.length === 1) {
      selectedPoints = [points[0]];
    } else if (points.length === 2) {
      selectedPoints = points;
    } else if (points.length <= 5) {
      selectedPoints = [points[0], points[points.length - 1]];
    } else {
      // Show first, last, and some middle points
      const controlPoints = [points[0]];
      const step = Math.max(1, Math.floor(points.length / 4));
      for (let i = step; i < points.length - 1; i += step) {
        controlPoints.push(points[i]);
      }
      controlPoints.push(points[points.length - 1]);
      selectedPoints = controlPoints;
    }

    // Convert to pixel coordinates, passing all points for reference
    return selectedPoints
      .map(p => convertToPixelCoordinates(p, points))
      .filter(p => p !== null) as { x: number; y: number }[];
  }, [convertToPixelCoordinates]);

  const controlPoints = getControlPoints(points);

  // Calculate x coordinates for the selected minute zone using state and effect
  const [zoneStartX, setZoneStartX] = useState<number | null>(null);
  const [zoneEndX, setZoneEndX] = useState<number | null>(null);

  useEffect(() => {
    if (!currentTime || !selectedMinute) {
      setZoneStartX(null);
      setZoneEndX(null);
      return;
    }

    const startTime = currentTime + (selectedMinute * 60);
    const endTime = startTime + 60;

    const updateCoordinates = () => {
      if (!chartRef.current?.chart) {
        setZoneStartX(null);
        setZoneEndX(null);
        return;
      }

      try {
        const timeScale = chartRef.current.chart.timeScale();
        const startX = timeScale.timeToCoordinate(startTime as Time);
        const endX = timeScale.timeToCoordinate(endTime as Time);

        // Only update if coordinates are valid (not null)
        if (startX !== null && endX !== null) {
          setZoneStartX(startX);
          setZoneEndX(endX);
        } else {
          // If coordinates are null, the times might be outside visible range
          // Try again after a short delay to allow chart to update
          return setTimeout(() => {
            if (chartRef.current?.chart) {
              const timeScale = chartRef.current.chart.timeScale();
              const retryStartX = timeScale.timeToCoordinate(startTime as Time);
              const retryEndX = timeScale.timeToCoordinate(endTime as Time);
              if (retryStartX !== null && retryEndX !== null) {
                setZoneStartX(retryStartX);
                setZoneEndX(retryEndX);
              }
            }
          }, 100);
        }
      } catch (error) {
        // Ignore conversion errors
        setZoneStartX(null);
        setZoneEndX(null);
      }
      return null;
    };

    const timeoutId = updateCoordinates();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [currentTime, selectedMinute]);

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 w-full h-full pointer-events-auto"
      style={{
        cursor: isConfirmed ? 'not-allowed' : 'crosshair',
        zIndex: 1000,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'auto'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Drawing zone - highlight the selected minute area */}
      {zoneStartX !== null && zoneEndX !== null && selectedMinute && (
        <>
          {/* Highlighted zone - more visible */}
          <rect
            x={zoneStartX}
            y={0}
            width={Math.max(0, zoneEndX - zoneStartX)}
            height="100%"
            fill="#fbbf24"
            opacity={0.25}
          />
          {/* Left border - solid and prominent */}
          <line
            x1={zoneStartX}
            y1={0}
            x2={zoneStartX}
            y2="100%"
            stroke="#fbbf24"
            strokeWidth={3}
            opacity={0.9}
          />
          {/* Right border - solid and prominent */}
          <line
            x1={zoneEndX}
            y1={0}
            x2={zoneEndX}
            y2="100%"
            stroke="#fbbf24"
            strokeWidth={3}
            opacity={0.9}
          />
          {/* Label - more prominent */}
          {points.length === 0 && (
            <>
              <rect
                x={(zoneStartX + zoneEndX) / 2 - 80}
                y={15}
                width={160}
                height={25}
                fill="rgba(251, 191, 36, 0.9)"
                rx={4}
              />
              <text
                x={(zoneStartX + zoneEndX) / 2}
                y={32}
                fill="#0a0a0a"
                fontSize={14}
                fontWeight="bold"
                textAnchor="middle"
              >
                Draw here (+{selectedMinute} min)
              </text>
            </>
          )}
        </>
      )}

      {/* While drawing - lime green line */}
      {isDrawing && points.length > 0 && (
        <path
          d={generateSmoothPath(points, false)}
          stroke="#00E5FF"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={1}
          style={{
            filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.8))'
          }}
        />
      )}

      {/* After drawing - prediction line on chart (shift to cat when cat position available) */}
      {!isDrawing && points.length > 0 && (() => {
        const pixelPoints = points
          .map(p => convertToPixelCoordinates(p, points))
          .filter(p => p !== null) as { x: number; y: number }[];

        if (pixelPoints.length === 0) return null;

        const pointsToRender = catPosition
          ? (() => {
            const avgY = pixelPoints.reduce((sum, p) => sum + p.y, 0) / pixelPoints.length;
            const yOffset = catPosition.y - avgY;
            return pixelPoints.map(p => ({ x: p.x, y: p.y + yOffset }));
          })()
          : pixelPoints;

        let d = `M ${pointsToRender[0].x},${pointsToRender[0].y}`;
        for (let i = 1; i < pointsToRender.length; i++) {
          const prev = pointsToRender[i - 1];
          const curr = pointsToRender[i];
          const cpx = prev.x + (curr.x - prev.x) / 2;
          const cpy = prev.y + (curr.y - prev.y) / 2;
          d += ` Q ${cpx},${cpy} ${curr.x},${curr.y}`;
        }

        return (
          <path
            d={d}
            stroke="#00E5FF"
            strokeWidth={4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(0, 229, 255, 0.8))'
            }}
          />
        );
      })()}

    </svg>
  );
}
