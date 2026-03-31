export type CanvasPoint = { x: number; y: number };

const DEFAULT_BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export function samplePredictionPoints(
  points: CanvasPoint[],
  desiredCount = 60,
): CanvasPoint[] {
  if (points.length === 0) {
    throw new Error(
      'Not enough points to sample the required number of predictions',
    );
  }

  if (points.length < desiredCount) {
    throw new Error(
      'Not enough points to sample the required number of predictions',
    );
  }

  const maxY = points.reduce((max, p) => (p.y > max ? p.y : max), points[0].y);

  if (points.length === desiredCount) {
    return points.map((p) => ({ x: p.x, y: maxY - p.y }));
  }

  const result: CanvasPoint[] = [];
  const lastIndex = points.length - 1;

  for (let i = 0; i < desiredCount; i++) {
    const t = desiredCount === 1 ? 0 : i / (desiredCount - 1);
    const index = Math.round(t * lastIndex);
    const point = points[index];
    result.push({ x: point.x, y: maxY - point.y });
  }

  return result;
}

export async function uploadSampledPredictionPoints(options: {
  points: CanvasPoint[];
  userAddress: string;
  desiredCount?: number;
  backendUrl?: string;
}): Promise<{ commitmentId: string; predictions: number[] }> {
  const {
    points,
    userAddress,
    desiredCount = 60,
    backendUrl = DEFAULT_BACKEND_URL,
  } = options;

  if (!userAddress) {
    throw new Error('uploadSampledPredictionPoints: userAddress is required');
  }

  // Sample and normalize points before upload so we always send exactly
  // desiredCount predictions (default 60) per storage commitment.
  const sampledPoints = samplePredictionPoints(points, desiredCount);
  const predictions = sampledPoints.map((p) => p.y + 1);
  console.log('predictions:', predictions);
  console.log('backendUrl:', backendUrl);
  console.log('userAddress:', userAddress);
  const res = await fetch(`${backendUrl}/api/predictions/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      predictions,
      userAddress,
    }),
  });
  console.log('res:', res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error || `Prediction upload failed with status ${res.status}`,
    );
  }

  const json = await res.json();
  const commitmentId = json.commitmentId as string | undefined;

  if (!commitmentId) {
    throw new Error(
      'Prediction upload succeeded but backend did not return commitmentId',
    );
  }

  return { commitmentId, predictions };
}