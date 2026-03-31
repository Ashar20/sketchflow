import type { ChartOptions, SeriesOptionsCommon, Time } from 'lightweight-charts';

export function getChartConfig(isDark: boolean = true, barSpacing: number = 0.5): Partial<ChartOptions> {
  return {
    layout: {
      background: { color: '#0a0a0a' }, // Dark theme like Euphoria
      textColor: '#ec4899', // Pink text color for all axis labels
    } as any,
    grid: {
      vertLines: { color: 'rgba(236, 72, 153, 0.2)', visible: true }, // Pink grid lines
      horzLines: { color: 'rgba(236, 72, 153, 0.2)', visible: true }, // Pink grid lines
    },
    localization: {
      timeFormatter: (time: number) => {
        const date = new Date(time * 1000);
        // Explicitly format as local time using getHours/getMinutes
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      },
    },
    timeScale: {
      visible: true, // Ensure time scale is visible
      timeVisible: true,
      secondsVisible: false,
      borderColor: 'rgba(236, 72, 153, 0.3)',
      borderVisible: true,
      rightOffset: 120, // Increased space for future predictions (up to 5 minutes = 300 seconds, but 120 bars gives about 3-4 minutes depending on barSpacing)
      barSpacing: barSpacing, // Spacing between bars (adjustable)
      fixLeftEdge: false,
      fixRightEdge: false, // Don't fix right edge so we can scroll
      minBarSpacing: 1, // Minimum spacing to ensure labels are visible
      tickMarkFormatter: (time: Time) => {
        const timestamp = typeof time === 'number' ? time : 0;
        const date = new Date(timestamp * 1000);
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      },
    },
    rightPriceScale: {
      borderColor: 'rgba(236, 72, 153, 0.3)',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1,
      },
      entireTextOnly: false,
      textColor: '#ec4899',
    },
    crosshair: {
      vertLine: {
        color: 'rgba(236, 72, 153, 0.5)',
        width: 1,
        style: 0,
        labelBackgroundColor: '#1a0a14',
      },
      horzLine: {
        color: 'rgba(236, 72, 153, 0.5)',
        width: 1,
        style: 0,
        labelBackgroundColor: '#1a0a14',
      },
      mode: 0, // Normal mode
    },
  } as any;
}

export function getLineSeriesConfig(isDark: boolean = true): Partial<SeriesOptionsCommon> {
  return {
    color: '#2dd4bf', // Teal color - smooth solid line
    lineWidth: 3, // Thicker line for better visibility
    lineStyle: 0, // Solid line
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 6,
  } as any;
}

export function getAreaSeriesConfig(isDark: boolean = true): Partial<SeriesOptionsCommon> {
  return {
    lineColor: '#ec4899', // Pink line like Euphoria
    topColor: 'rgba(236, 72, 153, 0.3)', // Pink gradient fill
    bottomColor: 'rgba(236, 72, 153, 0.0)', // Transparent bottom
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: false, // Hide the price label - replaced by Nyan Cat
    crosshairMarkerVisible: true,
    crosshairMarkerRadius: 4,
  } as any;
}
