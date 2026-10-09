import { resolvePermissions } from './resolve';

describe('resolvePermissions', () => {
  it('takes the widest scope across roles', () => {
    const r = resolvePermissions([
      { permission: 'VIEW_ATTENDANCE', scope: 'OWN_STAGE', stageId: 's1' },
      { permission: 'VIEW_ATTENDANCE', scope: 'ALL' },
    ], []);
    expect(r.VIEW_ATTENDANCE.scope).toBe('ALL');
  });
  it('collects stage ids for stage-scoped grants', () => {
    const r = resolvePermissions([
      { permission: 'TAKE_ATTENDANCE', scope: 'OWN_STAGE', stageId: 's1' },
      { permission: 'TAKE_ATTENDANCE', scope: 'OWN_STAGE', stageId: 's2' },
    ], []);
    expect(r.TAKE_ATTENDANCE.stageIds.sort()).toEqual(['s1', 's2']);
  });
  it('deny override beats any role grant', () => {
    const r = resolvePermissions(
      [{ permission: 'EDIT_CHILDREN', scope: 'ALL' }],
      [{ permission: 'EDIT_CHILDREN', effect: 'deny', scope: 'ALL' }]);
    expect(r.EDIT_CHILDREN).toBeUndefined();
  });
  it('grant override adds a permission the roles do not give', () => {
    const r = resolvePermissions([], [{ permission: 'VIEW_REPORTS', effect: 'grant', scope: 'OWN_STAGE', stageId: 's1' }]);
    expect(r.VIEW_REPORTS.scope).toBe('OWN_STAGE');
  });
  it('ignores NONE scope', () => {
    const r = resolvePermissions([{ permission: 'X', scope: 'NONE' }], []);
    expect(r.X).toBeUndefined();
  });
});
