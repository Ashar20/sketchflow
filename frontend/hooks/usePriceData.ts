'use client';

import { useEffect, useReducer, useRef } from 'react';
import type { PricePoint, PriceDataState } from '@/types/price';

type Action =
  | { type: 'ADD_PRICE'; payload: PricePoint }
  | { type: 'ERROR'; payload: Error }
  | { type: 'LOADING' }
  | { type: 'CONNECTED' }
  | { type: 'RESET'; payload: PricePoint[] };

function baselinePriceForSymbol(symbol: string): number {
  switch (symbol) {
    case 'BTCUSDT':
      return 95_000;
    case 'ETHUSDT':
      return 3500;
    case 'FLOWUSDT':
      return 0.85;
    case 'DOGEUSDT':
      return 0.12;
    case 'AAVEUSDT':
      return 180;
    default:
      return 1;
  }
}

/** Short synthetic history until the first live ticker arrives */
function generateDummyHistory(symbol: string): PricePoint[] {
  const history: PricePoint[] = [];
  const now = Math.floor(Date.now() / 1000);
  const basePrice = baselinePriceForSymbol(symbol);
  const wiggle = basePrice > 100 ? basePrice * 0.00015 : basePrice * 0.015;

  for (let i = 120; i >= 0; i -= 2) {
    const timestamp = now - i;
    const variation =
      Math.sin(i / 20) * wiggle + (Math.random() - 0.5) * wiggle * 0.5;
    const price = basePrice + variation;
    const lo = basePrice - wiggle * 2;
    const hi = basePrice + wiggle * 2;
    history.push({
      time: timestamp,
      value: Math.max(lo, Math.min(hi, price)),
    });
  }

  return history;
}

function priceDataReducer(state: PriceDataState, action: Action): PriceDataState {
  switch (action.type) {
    case 'RESET':
      return { data: action.payload, isLoading: true, error: null };
    case 'LOADING':
      return { ...state, isLoading: true, error: null };
    case 'CONNECTED':
      return { ...state, isLoading: false, error: null };
    case 'ADD_PRICE': {
      const newData = [...state.data, action.payload];
      const maxPoints = 120;
      const trimmedData = newData.length > maxPoints ? newData.slice(-maxPoints) : newData;
      return { data: trimmedData, isLoading: false, error: null };
    }
    case 'ERROR':
      return { ...state, isLoading: false, error: action.payload };
    default:
      return state;
  }
}

export function usePriceData(tickerSymbol: string = 'FLOWUSDT') {
  const [state, dispatch] = useReducer(priceDataReducer, tickerSymbol, (sym) => ({
    data: generateDummyHistory(sym),
    isLoading: true,
    error: null,
  }));
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const currentTickerRef = useRef<string>(tickerSymbol);

  useEffect(() => {
    isMountedRef.current = true;
    currentTickerRef.current = tickerSymbol;
    dispatch({ type: 'RESET', payload: generateDummyHistory(tickerSymbol) });

    function connect() {
      if (!isMountedRef.current) return;

      const wsUrl = 'wss://stream.bybit.com/v5/public/spot';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        dispatch({ type: 'CONNECTED' });

        const ticker = `tickers.${currentTickerRef.current}`;
        ws.send(
          JSON.stringify({
            op: 'subscribe',
            args: [ticker],
          }),
        );
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;

        const msg = JSON.parse(event.data);

        if (!msg.data || !msg.topic) return;
        if (!msg.topic.startsWith('tickers.')) return;

        const t = msg.data;

        if (t.lastPrice) {
          const timestamp = Math.floor(Date.now() / 1000);
          const pricePoint: PricePoint = {
            time: timestamp,
            value: Number(t.lastPrice),
          };

          dispatch({ type: 'ADD_PRICE', payload: pricePoint });
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        dispatch({ type: 'LOADING' });
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
        wsRef.current = null;
      }
    };
  }, [tickerSymbol]);

  return state;
}
