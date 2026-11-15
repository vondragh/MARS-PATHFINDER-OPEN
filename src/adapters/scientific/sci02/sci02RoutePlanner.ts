import type { RoutePlannerAdapter, RoutePlannerInput, RoutePlannerResult } from '../../../domain/routing/types';
import { validateRouteResult } from '../../../domain/routing/validation';

export type Sci02Executor = (input: RoutePlannerInput, signal: AbortSignal) => Promise<RoutePlannerResult>;

export interface Sci02RoutePlannerAdapter extends RoutePlannerAdapter {
  readonly id: 'sci02-a-star-v1';
  readonly label: 'SCI-02 A* route planner';
  readonly provenance: 'scientific';
}

/**
 * SCI-02 uses a dedicated Worker in the browser so terrain normalization and A*
 * never run on the React main thread. Inject an executor only for deterministic
 * unit/contract tests.
 */
export function createSci02RoutePlannerAdapter(execute: Sci02Executor = executeInWorker): Sci02RoutePlannerAdapter {
  return {
    id: 'sci02-a-star-v1',
    label: 'SCI-02 A* route planner',
    provenance: 'scientific',
    async calculate(input, signal) {
      try {
        const result = await execute(input, signal);
        if (signal.aborted) throw abortError();
        const issues = validateRouteResult(result, input.requestId);
        if (issues.length) return failedResult(input.requestId, `SCI-02 returned an invalid canonical route result: ${issues.join(' ')}`);
        return result;
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
        return failedResult(input.requestId, error instanceof Error ? error.message : 'SCI-02 calculation failed.');
      }
    },
  };
}

export const sci02RoutePlanner: Sci02RoutePlannerAdapter = createSci02RoutePlannerAdapter();

function executeInWorker(input: RoutePlannerInput, signal: AbortSignal): Promise<RoutePlannerResult> {
  if (signal.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') return Promise.reject(new Error('Web Workers are unavailable; SCI-02 calculation was not started on the UI thread.'));

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./routePlanner.worker.ts', import.meta.url), { type: 'module' });
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
    worker.onmessage = event => {
      const response = event.data as { requestId?: string; result?: RoutePlannerResult; error?: string };
      if (response.requestId !== input.requestId) {
        finish();
        reject(new Error('SCI-02 worker response requestId does not match the active calculation.'));
      } else if (response.error || !response.result) {
        finish();
        reject(new Error(response.error ?? 'SCI-02 worker returned no route result.'));
      } else {
        finish();
        resolve(response.result);
      }
    };
    worker.onerror = event => {
      finish();
      reject(new Error(event.message || 'SCI-02 worker could not complete the calculation.'));
    };

    try {
      worker.postMessage(input);
    } catch (error) {
      finish();
      reject(error);
    }
  });
}

function failedResult(requestId: string, failureReason: string): RoutePlannerResult {
  return {
    requestId,
    status: 'failed',
    feasible: false,
    alternatives: [],
    warnings: ['SCI-02 adapter failure; no route metrics are available.'],
    modelAssumptions: ['SCI-02 output was unavailable or failed canonical response validation.'],
    failureCode: 'calculation-error',
    failureReason,
  };
}

function abortError() {
  return new DOMException('SCI-02 calculation cancelled.', 'AbortError');
}
