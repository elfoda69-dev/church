import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { assertStageScope } from '../common/scope';
import { todayDate } from '../common/dates';
import { Effective } from '../rbac/resolve';
import { paged, skipTake } from '../common/pagination';
import { AssignmentDto, CreateServantDto, ServantListQuery, SetAssignmentsDto, UpdateServantDto } from './dto/servants.dto';

const notFound = () => new AppException('SERVANT_NOT_FOUND', 'الخادم غير موجود', 'Servant not found', 404);
const forbidden = () =>
  new AppException('FORBIDDEN_SCOPE', 'ليست لديك صلاحية على هذه المرحلة', 'This stage is outside your permission scope', 403);

@Injectable()
export class ServantsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---------- read ----------
  async list(q: ServantListQuery, eff: Effective | undefined) {
    if (!eff || eff.scope === 'NONE') return paged([], 0, q);
    const activeAssignment = { some: { status: 'active' as const, ...(q.stageId ? { stageId: q.stageId } : {}) } };
    let stageWhere: any = {};
    if (eff.scope === 'OWN_STAGE') {
      if (q.stageId && !eff.stageIds.includes(q.stageId)) throw forbidden();
      stageWhere = { assignments: { some: { status: 'active', stageId: { in: q.stageId ? [q.stageId] : eff.stageIds } } } };
    } else if (eff.scope === 'ALL') {
      if (q.stageId) stageWhere = { assignments: activeAssignment };
    } else {
      return paged([], 0, q);
    }
    const where: any = {
      ...stageWhere, status: q.status,
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { mobile: { contains: q.q } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.servant.findMany({
        where, orderBy: { fullName: 'asc' }, ...skipTake(q),
        include: { assignments: { where: { status: 'active' }, include: { stage: { select: { name: true } }, class: { select: { name: true } } } } },
      }),
      this.prisma.servant.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async get(id: string, eff: Effective | undefined) {
    const servant = await this.prisma.servant.findUnique({
      where: { id },
      include: { assignments: { orderBy: { startDate: 'desc' }, include: { stage: { select: { name: true } }, class: { select: { name: true } } } } },
    });
    if (!servant) throw notFound();
    this.assertReadAccess(servant.assignments.filter((a) => a.status === 'active').map((a) => a.stageId), eff);
    return servant;
  }

  private assertReadAccess(activeStageIds: string[], eff: Effective | undefined) {
    if (!eff || eff.scope === 'NONE') throw forbidden();
    if (eff.scope === 'ALL') return;
    if (eff.scope === 'OWN_STAGE' && activeStageIds.some((s) => eff.stageIds.includes(s))) return;
    if (eff.scope === 'OWN_STAGE' && activeStageIds.length === 0) return; // not yet assigned anywhere: visible, not editable
    throw forbidden();
  }

  private async getRaw(id: string) {
    const s = await this.prisma.servant.findUnique({ where: { id } });
    if (!s) throw notFound();
    return s;
  }

  // ---------- write (EDIT_SERVANTS is ALL-scope only by default — see seed matrix) ----------
  async create(dto: CreateServantDto, actorId: string, ip?: string) {
    if (dto.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!user) throw new AppException('USER_NOT_FOUND', 'المستخدم غير موجود', 'User not found', 404);
    }
    const servant = await this.prisma.servant.create({
      data: {
        fullName: dto.fullName, mobile: dto.mobile, whatsapp: dto.whatsapp,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
        serviceStartDate: dto.serviceStartDate ? new Date(dto.serviceStartDate) : null,
        notes: dto.notes, userId: dto.userId,
      },
    });
    await this.audit.log({ userId: actorId, action: 'SERVANT_CREATED', entity: 'servant', entityId: servant.id, newValue: servant, ip });
    return servant;
  }

  async update(id: string, dto: UpdateServantDto, actorId: string, ip?: string) {
    const before = await this.getRaw(id);
    const servant = await this.prisma.servant.update({
      where: { id },
      data: {
        fullName: dto.fullName, mobile: dto.mobile, whatsapp: dto.whatsapp,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        serviceStartDate: dto.serviceStartDate ? new Date(dto.serviceStartDate) : undefined, notes: dto.notes,
      },
    });
    await this.audit.log({ userId: actorId, action: 'SERVANT_UPDATED', entity: 'servant', entityId: id, oldValue: before, newValue: servant, ip });
    return servant;
  }

  async setStatus(id: string, status: 'active' | 'inactive', actorId: string, ip?: string) {
    const before = await this.getRaw(id);
    const servant = await this.prisma.servant.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId: actorId, action: status === 'inactive' ? 'SERVANT_DISABLED' : 'SERVANT_ENABLED',
      entity: 'servant', entityId: id, oldValue: { status: before.status }, newValue: { status }, ip,
    });
    return servant;
  }

  /**
   * Replaces the servant's stage assignments. Removed ones are ENDED
   * (status='ended', end_date=today), never deleted, so history survives.
   * Each target stage is checked against the caller's scope individually —
   * an OWN_STAGE holder can only assign within their own stage(s).
   */
  async setAssignments(servantId: string, dto: SetAssignmentsDto, eff: Effective | undefined, actorId: string, ip?: string) {
    await this.getRaw(servantId);
    for (const a of dto.assignments) assertStageScope(eff, a.stageId);
    for (const a of dto.assignments) if (a.classId) await this.assertClassInStage(a.classId, a.stageId);

    const today = todayDate();
    const current = await this.prisma.servantStageAssignment.findMany({ where: { servantId, status: 'active' } });
    const same = (c: (typeof current)[number], w: AssignmentDto) => c.stageId === w.stageId && (c.classId ?? null) === (w.classId ?? null);
    const toEnd = current.filter((c) => !dto.assignments.some((w) => same(c, w)));
    const toAdd = dto.assignments.filter((w) => !current.some((c) => same(c, w)));

    await this.prisma.$transaction([
      this.prisma.servantStageAssignment.updateMany({ where: { id: { in: toEnd.map((c) => c.id) } }, data: { status: 'ended', endDate: today } }),
      ...toAdd.map((w) => this.prisma.servantStageAssignment.create({
        data: {
          servantId, stageId: w.stageId, classId: w.classId, roleTitle: w.roleTitle,
          startDate: w.startDate ? new Date(w.startDate) : today, endDate: w.endDate ? new Date(w.endDate) : null,
        },
      })),
    ]);
    await this.audit.log({ userId: actorId, action: 'SERVANT_ASSIGNMENTS_CHANGED', entity: 'servant', entityId: servantId, oldValue: current, newValue: dto.assignments, ip });
    return this.prisma.servantStageAssignment.findMany({ where: { servantId, status: 'active' }, include: { stage: { select: { name: true } } } });
  }

  private async assertClassInStage(classId: string, stageId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls || cls.stageId !== stageId) {
      throw new AppException('CLASS_NOT_IN_STAGE', 'هذا الفصل لا يتبع هذه المرحلة', 'This class does not belong to the given stage', 400);
    }
  }
}
