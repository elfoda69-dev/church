import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { todayDate } from '../common/dates';
import { assertRecordReadScope, assertStageScope, stageScopeWhere } from '../common/scope';
import { Effective } from '../rbac/resolve';
import { paged, skipTake } from '../common/pagination';
import {
  ChildListQuery, ChildParentLinkDto, CreateChildDto, CreateParentDto, ParentListQuery,
  SetChildParentsDto, TransferChildDto, UpdateChildDto, UpdateParentDto,
} from './dto/children.dto';

const childNotFound = () => new AppException('CHILD_NOT_FOUND', 'الطفل غير موجود', 'Child not found', 404);
const parentNotFound = () => new AppException('PARENT_NOT_FOUND', 'ولي الأمر غير موجود', 'Parent not found', 404);
const buildFullName = (first: string, middle: string | null | undefined, last: string) =>
  [first, middle, last].filter(Boolean).join(' ');

@Injectable()
export class ChildrenService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---------- read ----------
  async list(q: ChildListQuery, eff: Effective | undefined) {
    let stageWhere: Record<string, unknown>;
    if (q.stageId) {
      assertStageScope(eff, q.stageId);
      stageWhere = { currentStageId: q.stageId };
    } else {
      stageWhere = stageScopeWhere(eff);
    }
    const where: any = {
      ...stageWhere,
      status: q.status,
      currentClassId: q.classId,
      ...(q.q ? { OR: [{ fullName: { contains: q.q, mode: 'insensitive' } }, { mobile: { contains: q.q } }] } : {}),
    };
    const [data, total] = await Promise.all([
      this.prisma.child.findMany({
        where, orderBy: { fullName: 'asc' }, ...skipTake(q),
        include: { currentStage: { select: { id: true, name: true } }, currentClass: { select: { id: true, name: true } } },
      }),
      this.prisma.child.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async get(id: string, eff: Effective | undefined, actorUserId: string) {
    const child = await this.prisma.child.findUnique({
      where: { id },
      include: {
        currentStage: { select: { id: true, name: true } },
        currentClass: { select: { id: true, name: true } },
        parents: { include: { parent: true } },
      },
    });
    if (!child) throw childNotFound();
    assertRecordReadScope(eff, { stageId: child.currentStageId, ownerUserId: child.userId }, actorUserId);
    return child;
  }

  private async getRaw(id: string) {
    const child = await this.prisma.child.findUnique({ where: { id } });
    if (!child) throw childNotFound();
    return child;
  }

  // ---------- write ----------
  async create(dto: CreateChildDto, eff: Effective | undefined, actorId: string, ip?: string) {
    assertStageScope(eff, dto.stageId);
    if (dto.classId) await this.assertClassInStage(dto.classId, dto.stageId);
    const fullName = buildFullName(dto.firstName, dto.middleName, dto.lastName);
    const today = todayDate();

    const child = await this.prisma.$transaction(async (tx) => {
      const created = await tx.child.create({
        data: {
          firstName: dto.firstName, middleName: dto.middleName, lastName: dto.lastName, fullName,
          mobile: dto.mobile, whatsapp: dto.whatsapp, fatherPhone: dto.fatherPhone, motherPhone: dto.motherPhone,
          dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null, address: dto.address,
          currentStageId: dto.stageId, currentClassId: dto.classId,
          enrollmentDate: dto.enrollmentDate ? new Date(dto.enrollmentDate) : today, notes: dto.notes,
        },
      });
      await tx.childEnrollment.create({
        data: { childId: created.id, stageId: dto.stageId, classId: dto.classId, startDate: today, movedBy: actorId, reason: 'enrollment' },
      });
      return created;
    });
    await this.audit.log({ userId: actorId, action: 'CHILD_CREATED', entity: 'child', entityId: child.id, newValue: child, ip });
    return child;
  }

  async update(id: string, dto: UpdateChildDto, eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.getRaw(id);
    assertStageScope(eff, before.currentStageId);
    const fullName = dto.firstName || dto.middleName !== undefined || dto.lastName
      ? buildFullName(dto.firstName ?? before.firstName, dto.middleName ?? before.middleName, dto.lastName ?? before.lastName)
      : undefined;
    const child = await this.prisma.child.update({
      where: { id },
      data: {
        firstName: dto.firstName, middleName: dto.middleName, lastName: dto.lastName, fullName,
        mobile: dto.mobile, whatsapp: dto.whatsapp, fatherPhone: dto.fatherPhone, motherPhone: dto.motherPhone,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined, address: dto.address, notes: dto.notes,
      },
    });
    await this.audit.log({ userId: actorId, action: 'CHILD_UPDATED', entity: 'child', entityId: id, oldValue: before, newValue: child, ip });
    return child;
  }

  async setStatus(id: string, status: 'active' | 'inactive', eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.getRaw(id);
    assertStageScope(eff, before.currentStageId);
    const child = await this.prisma.child.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId: actorId, action: status === 'inactive' ? 'CHILD_DEACTIVATED' : 'CHILD_REACTIVATED',
      entity: 'child', entityId: id, oldValue: { status: before.status }, newValue: { status }, ip,
    });
    return child;
  }

  /** Moves a child to a new stage/class. The old enrollment is closed, a new one opened — history is kept forever. */
  async transfer(id: string, dto: TransferChildDto, eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.getRaw(id);
    assertStageScope(eff, before.currentStageId); // must be able to edit in the OLD stage
    assertStageScope(eff, dto.stageId);           // ...and in the NEW stage
    if (dto.classId) await this.assertClassInStage(dto.classId, dto.stageId);
    const today = todayDate();

    const child = await this.prisma.$transaction(async (tx) => {
      await tx.childEnrollment.updateMany({
        where: { childId: id, endDate: null }, data: { endDate: today, movedBy: actorId, reason: dto.reason },
      });
      await tx.childEnrollment.create({
        data: { childId: id, stageId: dto.stageId, classId: dto.classId, startDate: today, movedBy: actorId, reason: dto.reason },
      });
      return tx.child.update({ where: { id }, data: { currentStageId: dto.stageId, currentClassId: dto.classId ?? null } });
    });
    await this.audit.log({
      userId: actorId, action: 'CHILD_TRANSFERRED', entity: 'child', entityId: id,
      oldValue: { stageId: before.currentStageId, classId: before.currentClassId },
      newValue: { stageId: dto.stageId, classId: dto.classId, reason: dto.reason }, ip,
    });
    return child;
  }

  async timeline(id: string, eff: Effective | undefined, actorUserId: string) {
    const child = await this.get(id, eff, actorUserId);
    const enrollments = await this.prisma.childEnrollment.findMany({
      where: { childId: id }, orderBy: { startDate: 'desc' },
      include: { stage: { select: { name: true } }, class: { select: { name: true } } },
    });
    // Attendance/confession/score events join in from Phases 6-8 onward; this
    // endpoint's shape is stable, so those phases only ADD entries, never change it.
    return {
      childId: id,
      events: enrollments.map((e) => ({
        type: 'stage_change', date: e.startDate, endDate: e.endDate,
        stageName: e.stage.name, className: e.class?.name ?? null, reason: e.reason,
      })),
      note: 'Attendance, confession, and iScore events will appear here starting Phase 6.',
    };
  }

  private async assertClassInStage(classId: string, stageId: string) {
    const cls = await this.prisma.class.findUnique({ where: { id: classId } });
    if (!cls || cls.stageId !== stageId) {
      throw new AppException('CLASS_NOT_IN_STAGE', 'هذا الفصل لا يتبع هذه المرحلة', 'This class does not belong to the given stage', 400);
    }
  }

  // ---------- parents ----------
  async setChildParents(childId: string, dto: SetChildParentsDto, eff: Effective | undefined, actorId: string, ip?: string) {
    const child = await this.getRaw(childId);
    assertStageScope(eff, child.currentStageId);
    const ids = dto.parents.map((p) => p.parentId);
    const found = await this.prisma.parent.findMany({ where: { id: { in: ids } } });
    if (found.length !== ids.length) throw parentNotFound();

    await this.prisma.$transaction([
      this.prisma.childParent.deleteMany({ where: { childId, parentId: { notIn: ids } } }),
      ...dto.parents.map((p: ChildParentLinkDto) => this.prisma.childParent.upsert({
        where: { childId_parentId: { childId, parentId: p.parentId } },
        update: { isPrimary: p.isPrimary ?? false },
        create: { childId, parentId: p.parentId, isPrimary: p.isPrimary ?? false },
      })),
    ]);
    await this.audit.log({ userId: actorId, action: 'CHILD_PARENTS_CHANGED', entity: 'child', entityId: childId, newValue: dto.parents, ip });
    return this.prisma.childParent.findMany({ where: { childId }, include: { parent: true } });
  }

  async listParents(q: ParentListQuery) {
    const where = q.q
      ? { OR: [{ name: { contains: q.q, mode: 'insensitive' as const } }, { phone: { contains: q.q } }] }
      : {};
    const [data, total] = await Promise.all([
      this.prisma.parent.findMany({ where, orderBy: { name: 'asc' }, ...skipTake(q) }),
      this.prisma.parent.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async getParent(id: string) {
    const parent = await this.prisma.parent.findUnique({ where: { id }, include: { children: { include: { child: { select: { id: true, fullName: true } } } } } });
    if (!parent) throw parentNotFound();
    return parent;
  }

  async createParent(dto: CreateParentDto, actorId: string, ip?: string) {
    const parent = await this.prisma.parent.create({
      data: { name: dto.name, phone: dto.phone, whatsapp: dto.whatsapp, relationship: dto.relationship as any, notificationEnabled: dto.notificationEnabled ?? false },
    });
    await this.audit.log({ userId: actorId, action: 'PARENT_CREATED', entity: 'parent', entityId: parent.id, newValue: parent, ip });
    return parent;
  }

  async updateParent(id: string, dto: UpdateParentDto, actorId: string, ip?: string) {
    const before = await this.getParent(id);
    const parent = await this.prisma.parent.update({ where: { id }, data: dto as any });
    await this.audit.log({ userId: actorId, action: 'PARENT_UPDATED', entity: 'parent', entityId: id, oldValue: before, newValue: parent, ip });
    return parent;
  }
}
