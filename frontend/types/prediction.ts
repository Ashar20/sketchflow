export interface PredictionPoint {
  x: number;      // SVG coordinate (rendered)
  y: number;      // SVG coordinate (rendered)
  time: number;   // Chart time
  price: number;  // Chart price
  canvasX?: number;  // Original canvas X (0-600)
  canvasY?: number;  // Original canvas Y (0-200)
}

export interface PredictionPath {
  id: string;
  points: PredictionPoint[];
  createdAt: number;
  confirmedAt?: number;
}

export interface DrawingState {
  isDrawing: boolean;
  isConfirmed: boolean;
  currentPoints: PredictionPoint[];
  confirmedPath: PredictionPath | null;
}

export interface DirectionalMatch {
  time: number;
  price: number;
  predictedDirection: number;  // 1 = up, -1 = down, 0 = unchanged
  actualDirection: number;
}

export interface DirectionalScore {
  correctDirections: number;
  totalDirections: number;
  accuracy: number;              // 0 to 1
  pnl: number;                   // in ETH/tokens
  fee: number;
  finalAmount: number;
  maxProfit: number;
}

export interface PNLConfig {
  amount: number;                // Deposit amount in ETH
  leverage: number;              // 1-2500x
  feePercentage: number;         // 200 = 2%
}
