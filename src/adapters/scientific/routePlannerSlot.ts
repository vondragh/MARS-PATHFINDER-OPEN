import type { RoutePlannerAdapter } from '../../domain/routing/types';

/** Composition-root guard; the concrete scientific implementation stays owned by SCI-02. */
export function registerScientificRoutePlanner(adapter: RoutePlannerAdapter): RoutePlannerAdapter {
  if (adapter.provenance !== 'scientific') {
    throw new Error('A scientific adapter must declare provenance="scientific".');
  }
  return adapter;
}
