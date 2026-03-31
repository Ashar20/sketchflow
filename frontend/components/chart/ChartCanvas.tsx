'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type Time
} from 'lightweight-charts';
import { getChartConfig, getAreaSeriesConfig } from '@/lib/chart/config';
import type { PricePoint } from '@/types/price';

interface ChartCanvasProps {
  data: PricePoint[];
  isDark?: boolean;
  barSpacing?: number;
}

export interface ChartCanvasRef {
  chart: IChartApi | null;
  series: ISeriesApi<any> | null;
  container: HTMLDivElement | null;
}

export const ChartCanvas = forwardRef<ChartCanvasRef, ChartCanvasProps>(
  function ChartCanvas({ data, isDark = false, barSpacing = 0.5 }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);
    const hasInitializedView = useRef(false);
    const lastDataTimeRef = useRef<number | null>(null);
    const lastProcessedTimeRef = useRef<number | null>(null);
    const initializedRef = useRef(false);

    // Expose chart, series, and container to parent
    useImperativeHandle(ref, () => ({
      chart: chartRef.current,
      series: seriesRef.current,
      container: containerRef.current,
    }));

    // Initialize chart
    useEffect(() => {
      if (!containerRef.current) return;

      // Get actual container dimensions
      const containerHeight = containerRef.current.clientHeight || 280;
      const containerWidth = containerRef.current.clientWidth;

      const chart = createChart(containerRef.current, {
        width: containerWidth,
        height: containerHeight,
        ...getChartConfig(isDark, barSpacing),
      });

      // Use AreaSeries for smooth area chart like reference image
      const series = chart.addSeries(AreaSeries, getAreaSeriesConfig(isDark));

      chartRef.current = chart;
      seriesRef.current = series;
      
      // Reset initialization flags when chart is recreated
      initializedRef.current = false;
      lastProcessedTimeRef.current = null;
      hasInitializedView.current = false;
      lastDataTimeRef.current = null;

      // Handle resize
      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          const newHeight = containerRef.current.clientHeight || 280;
          const newWidth = containerRef.current.clientWidth;
          chartRef.current.resize(newWidth, newHeight);
        }
      };

      window.addEventListener('resize', handleResize);
      
      // Also trigger resize after a small delay to catch CSS layout changes
      setTimeout(handleResize, 100);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    }, [isDark, barSpacing]);
    
    // Update bar spacing when it changes
    useEffect(() => {
      if (chartRef.current) {
        chartRef.current.timeScale().applyOptions({ barSpacing });
      }
    }, [barSpacing]);

    // Update chart data incrementally for smooth movement
    useEffect(() => {
      if (seriesRef.current && chartRef.current && data.length > 0) {
        // Format data with proper Unix timestamps (lightweight-charts accepts Unix timestamps directly)
        // Sort by time and remove duplicates
        const sortedData = [...data].sort((a, b) => a.time - b.time);
        const uniqueData: PricePoint[] = [];
        const seenTimes = new Set<number>();
        
        for (const point of sortedData) {
          if (!seenTimes.has(point.time)) {
            seenTimes.add(point.time);
            uniqueData.push(point);
          }
        }
        
        const lastTime = uniqueData[uniqueData.length - 1].time;

        // Initialize with setData on first load, then use update() for incremental updates
        if (!initializedRef.current) {
          // First time: set all data
          const formattedData = uniqueData.map((point) => ({
            time: point.time as Time,
            value: point.value,
          }));
          seriesRef.current.setData(formattedData);
          initializedRef.current = true;
          if (uniqueData.length > 0) {
            lastProcessedTimeRef.current = uniqueData[uniqueData.length - 1].time;
          }
          
          // Set initial visible range AFTER setting data - center the current time with space on right for drawing (futures)
          if (!hasInitializedView.current && uniqueData.length >= 2) {
            // Use setTimeout to ensure data is processed before setting view range
            setTimeout(() => {
              if (!chartRef.current) return;

              // Show 2 minutes of history on left, 2 minutes gap on right for drawing
              const historyTime = 120; // 2 minutes of historical data
              const futureTime = 120; // 2 minutes gap on right for drawing predictions

              const startTime = lastTime - historyTime; // Start 10 min before current
              const endTime = lastTime + futureTime; // End 10 min after current (creates 10 min drawing gap)

              chartRef.current.timeScale().setVisibleRange({
                from: startTime as Time,
                to: endTime as Time,
              });

              hasInitializedView.current = true;
              lastDataTimeRef.current = lastTime;
            }, 0);
          }
        } else {
          // Incrementally update with only new data points (after last processed time)
          const newPoints = uniqueData.filter((point) => 
            lastProcessedTimeRef.current === null || point.time > lastProcessedTimeRef.current
          );
          
          // Update with each new point one at a time for smooth movement
          newPoints.forEach((point) => {
            seriesRef.current!.update({
              time: point.time as Time,
              value: point.value,
            });
          });
          
          // Update last processed time
          if (newPoints.length > 0) {
            lastProcessedTimeRef.current = newPoints[newPoints.length - 1].time;
          }

          // Auto-scroll to follow current time - this makes patterns scroll left
          if (lastTime > (lastDataTimeRef.current || 0)) {
            lastDataTimeRef.current = lastTime;

            // Update visible range to follow current time
            const historyTime = 120; // 2 minutes of historical data
            const futureTime = 120; // 2 minutes gap on right

            const startTime = lastTime - historyTime;
            const endTime = lastTime + futureTime;

            chartRef.current.timeScale().setVisibleRange({
              from: startTime as Time,
              to: endTime as Time,
            });
          }
        }
      }
    }, [data]);

    return (
      <div
        ref={containerRef}
        className="w-full h-[250px] sm:h-[300px] md:h-[350px]"
        style={{ 
          position: 'relative', 
          zIndex: 1,
        }}
      />
    );
  }
);
