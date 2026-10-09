/**
 * Pure permission resolution (no I/O) so it is fully unit-testable.
 * Rules:
 *  1. A `deny` override removes the permission entirely.
 *  2. A `grant` override adds to what roles give.
 *  3. The widest scope wins: ALL > OWN_STAGE > ASSIGNED_SESSION > OWN_RECORD.
 *  4. stageIds collects the stage_id of every role assignment that contributed.
 */
export const SCOPE_RANK = { NONE: 0, OWN_RECORD: 1, ASSIGNED_SESSION: 2, OWN_STAGE: 3, ALL: 4 } as const;
export type Scope = keyof typeof SCOPE_RANK;

export interface Grant { permission: string; scope: Scope; stageId?: string | null }
export interface Override extends Grant { effect: 'grant' | 'deny' }
export interface Effective { scope: Scope; stageIds: string[] }

export function resolvePermissions(grants: Grant[], overrides: Override[]): Record<string, Effective> {
  const denied = new Set(overrides.filter((o) => o.effect === 'deny').map((o) => o.permission));
  const all: Grant[] = [...grants, ...overrides.filter((o) => o.effect === 'grant')];
  const out: Record<string, Effective> = {};
  for (const g of all) {
    if (denied.has(g.permission) || g.scope === 'NONE') continue;
    const cur = (out[g.permission] ??= { scope: 'NONE', stageIds: [] });
    if (SCOPE_RANK[g.scope] > SCOPE_RANK[cur.scope]) cur.scope = g.scope;
    if (g.stageId && !cur.stageIds.includes(g.stageId)) cur.stageIds.push(g.stageId);
  }
  return out;
}
