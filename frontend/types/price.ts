export interface PricePoint {
  time: number;  // Unix timestamp
  value: number; // Calculated price
}

export interface PriceDataState {
  data: PricePoint[];
  isLoading: boolean;
  error: Error | null;
}
