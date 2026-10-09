import { Effective } from '../rbac/resolve';
import { AppException } from './errors/app.exception';

const forbidden = () =>
  new AppException('FORBIDDEN_SCOPE', 'ليست لديك صلاحية على هذه المرحلة', 'This stage is outside your permission scope', 403);

/**
 * Throws unless `eff` (the caller's effective grant for the permission being
 * used) covers `stageId`. Called before every write that targets one stage
 * (create/update/transfer/assign...). This is what makes a stage secretary's
 * OWN_STAGE grant actually mean "only their stage(s)" rather than trusting
 * the client to only ever send the right id.
 */
export function assertStageScope(eff: Effective | undefined, stageId: string | null | undefined): void {
  if (!eff || eff.scope === 'NONE') throw forbidden();
  if (eff.scope === 'ALL') return;
  if (eff.scope === 'OWN_STAGE') {
    if (stageId && eff.stageIds.includes(stageId)) return;
    throw forbidden();
  }
  throw forbidden(); // ASSIGNED_SESSION / OWN_RECORD never authorize stage-level writes
}

/**
 * Prisma `where` fragment that restricts a list query to what `eff` allows.
 * Returns `undefined` for ALL (no filter needed) or `{ id: { in: [] } }`
 * (matches nothing) when the caller has no stage-scoped access at all —
 * never returns "no filter" by accident for a narrower scope.
 */
export function stageScopeWhere(eff: Effective | undefined, stageField = 'currentStageId'): Record<string, unknown> {
  if (!eff || eff.scope === 'NONE') return { id: { in: [] } };
  if (eff.scope === 'ALL') return {};
  if (eff.scope === 'OWN_STAGE') return { [stageField]: { in: eff.stageIds } };
  return { id: { in: [] } };
}

/**
 * For single-record reads where OWN_RECORD (the record belongs to the caller)
 * is also a valid way in, e.g. a child viewing their own profile.
 */
export function assertRecordReadScope(
  eff: Effective | undefined,
  record: { stageId?: string | null; ownerUserId?: string | null },
  actorUserId: string,
): void {
  if (!eff || eff.scope === 'NONE') throw forbidden();
  if (eff.scope === 'ALL') return;
  if (eff.scope === 'OWN_STAGE' && record.stageId && eff.stageIds.includes(record.stageId)) return;
  if (eff.scope === 'OWN_RECORD' && record.ownerUserId && record.ownerUserId === actorUserId) return;
  throw forbidden();
}
