import { assertRecordReadScope, assertStageScope, stageScopeWhere } from './scope';
import { Effective } from '../rbac/resolve';

const eff = (scope: Effective['scope'], stageIds: string[] = []): Effective => ({ scope, stageIds });

describe('assertStageScope', () => {
  it('allows ALL scope regardless of stage', () => expect(() => assertStageScope(eff('ALL'), 'anything')).not.toThrow());
  it('allows OWN_STAGE when the stage is in the list', () => expect(() => assertStageScope(eff('OWN_STAGE', ['s1']), 's1')).not.toThrow());
  it('rejects OWN_STAGE when the stage is not in the list', () => expect(() => assertStageScope(eff('OWN_STAGE', ['s1']), 's2')).toThrow());
  it('rejects OWN_STAGE with no target stage (e.g. creating a brand new stage)', () => expect(() => assertStageScope(eff('OWN_STAGE', ['s1']), null)).toThrow());
  it('rejects ASSIGNED_SESSION for any stage-level write', () => expect(() => assertStageScope(eff('ASSIGNED_SESSION'), 's1')).toThrow());
  it('rejects an undefined grant', () => expect(() => assertStageScope(undefined, 's1')).toThrow());
});

describe('stageScopeWhere', () => {
  it('ALL -> no filter', () => expect(stageScopeWhere(eff('ALL'))).toEqual({}));
  it('OWN_STAGE -> IN filter over the stage field', () => expect(stageScopeWhere(eff('OWN_STAGE', ['s1', 's2']))).toEqual({ currentStageId: { in: ['s1', 's2'] } }));
  it('NONE/undefined -> matches nothing', () => {
    expect(stageScopeWhere(undefined)).toEqual({ id: { in: [] } });
    expect(stageScopeWhere(eff('NONE'))).toEqual({ id: { in: [] } });
  });
});

describe('assertRecordReadScope', () => {
  it('OWN_RECORD allows the owner', () => expect(() => assertRecordReadScope(eff('OWN_RECORD'), { ownerUserId: 'u1' }, 'u1')).not.toThrow());
  it('OWN_RECORD rejects a non-owner', () => expect(() => assertRecordReadScope(eff('OWN_RECORD'), { ownerUserId: 'u1' }, 'u2')).toThrow());
  it('OWN_STAGE allows when the record stage matches', () => expect(() => assertRecordReadScope(eff('OWN_STAGE', ['s1']), { stageId: 's1' }, 'u1')).not.toThrow());
});
