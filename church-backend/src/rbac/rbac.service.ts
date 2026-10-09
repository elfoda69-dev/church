import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { todayDate } from '../common/dates';
import { Effective, Grant, Override, resolvePermissions } from './resolve';

@Injectable()
export class RbacService {
  constructor(private prisma: PrismaService) {}

  /** Effective permissions of a user right now. (Redis cache comes in Phase 2.) */
  async getEffective(userId: string): Promise<Record<string, Effective>> {
    const today = todayDate();
    const now = new Date();
    const [userRoles, overrides] = await Promise.all([
      this.prisma.userRole.findMany({
        where: { userId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }], role: { status: 'active' } },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      }),
      this.prisma.userPermission.findMany({
        where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        include: { permission: true },
      }),
    ]);

    const grants: Grant[] = userRoles.flatMap((ur) =>
      ur.role.permissions.map((rp) => ({ permission: rp.permission.key, scope: rp.scope, stageId: ur.stageId })));
    const ovr: Override[] = overrides.map((o) => ({
      permission: o.permission.key, effect: o.effect, scope: o.scope, stageId: o.stageId }));
    return resolvePermissions(grants, ovr);
  }

  async activeRoleKeys(userId: string): Promise<string[]> {
    const today = todayDate();
    const rows = await this.prisma.userRole.findMany({
      where: { userId, validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
      include: { role: true },
    });
    return [...new Set(rows.map((r) => r.role.key))];
  }
}
