import type { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface ChartInstance {
  chart: IChartApi | null;
  series: ISeriesApi<any> | null;
}

export interface ChartConfig {
  layout: {
    background: { color: string };
    textColor: string;
  };
  grid: {
    vertLines: { color: string };
    horzLines: { color: string };
  };
  timeScale: {
    timeVisible: boolean;
    secondsVisible: boolean;
  };
}
