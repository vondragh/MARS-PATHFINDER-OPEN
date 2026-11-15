import type { RoutePlannerInput, RoutePlannerResult } from '../../../domain/routing/types';
import { executeSci02RoutePlanner } from './executeSci02RoutePlanner';

interface WorkerResponse {
  requestId: string;
  result?: RoutePlannerResult;
  error?: string;
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<RoutePlannerInput>) => void) | null;
  postMessage: (response: WorkerResponse) => void;
};

workerScope.onmessage = event => {
  const input = event.data;
  try {
    const result = executeSci02RoutePlanner(input);
    workerScope.postMessage({ requestId: input.requestId, result });
  } catch (error) {
    workerScope.postMessage({
      requestId: input?.requestId ?? 'invalid-request',
      error: error instanceof Error ? error.message : 'SCI-02 worker failed with an unknown error.',
    });
  }
};
