'use client';

import { useReducer, useCallback } from 'react';
import type { PredictionPoint, PredictionPath, DrawingState } from '@/types/prediction';

type Action =
  | { type: 'START_DRAWING'; payload: PredictionPoint }
  | { type: 'ADD_POINT'; payload: PredictionPoint }
  | { type: 'FINISH_DRAWING' }
  | { type: 'CONFIRM_PREDICTION' }
  | { type: 'CLEAR_PREDICTION' };

const initialState: DrawingState = {
  isDrawing: false,
  isConfirmed: false,
  currentPoints: [],
  confirmedPath: null,
};

function drawingReducer(state: DrawingState, action: Action): DrawingState {
  switch (action.type) {
    case 'START_DRAWING':
      return {
        ...state,
        isDrawing: true,
        currentPoints: [action.payload],
      };
    case 'ADD_POINT':
      if (!state.isDrawing) return state;
      return {
        ...state,
        currentPoints: [...state.currentPoints, action.payload],
      };
    case 'FINISH_DRAWING':
      return {
        ...state,
        isDrawing: false,
      };
    case 'CONFIRM_PREDICTION': {
      if (state.currentPoints.length < 2) return state;
      const path: PredictionPath = {
        id: `prediction-${Date.now()}`,
        points: state.currentPoints,
        createdAt: Date.now(),
        confirmedAt: Date.now(),
      };
      return {
        ...state,
        isConfirmed: true,
        confirmedPath: path,
      };
    }
    case 'CLEAR_PREDICTION':
      return initialState;
    default:
      return state;
  }
}

export function usePredictionDrawing() {
  const [state, dispatch] = useReducer(drawingReducer, initialState);

  const startDrawing = useCallback((point: PredictionPoint) => {
    dispatch({ type: 'START_DRAWING', payload: point });
  }, []);

  const addPoint = useCallback((point: PredictionPoint) => {
    dispatch({ type: 'ADD_POINT', payload: point });
  }, []);

  const finishDrawing = useCallback(() => {
    dispatch({ type: 'FINISH_DRAWING' });
  }, []);

  const confirmPrediction = useCallback(() => {
    dispatch({ type: 'CONFIRM_PREDICTION' });
    return state.currentPoints;
  }, [state.currentPoints]);

  const clearPrediction = useCallback(() => {
    dispatch({ type: 'CLEAR_PREDICTION' });
  }, []);

  return {
    ...state,
    startDrawing,
    addPoint,
    finishDrawing,
    confirmPrediction,
    clearPrediction,
  };
}
