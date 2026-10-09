import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { todayDate } from '../common/dates';
import { assertStageScope } from '../common/scope';
import { Effective } from '../rbac/resolve';
import { paged, skipTake } from '../common/pagination';
import { CreateClassDto, CreateStageDto, StageListQuery, UpdateClassDto, UpdateStageDto } from './dto/stages.dto';

const stageNotFound = () => new AppException('STAGE_NOT_FOUND', 'المرحلة غير موجودة', 'Stage not found', 404);
const classNotFound = () => new AppException('CLASS_NOT_FOUND', 'الفصل غير موجود', 'Class not found', 404);

@Injectable()
export class StagesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  // ---------- stages ----------
  async list(q: StageListQuery) {
    const where = { status: q.status as any };
    const [data, total] = await Promise.all([
      this.prisma.stage.findMany({ where, orderBy: { sortOrder: 'asc' }, ...skipTake(q) }),
      this.prisma.stage.count({ where }),
    ]);
    return paged(data, total, q);
  }

  async get(id: string) {
    const stage = await this.prisma.stage.findUnique({ where: { id } });
    if (!stage) throw stageNotFound();
    return stage;
  }

  async create(dto: CreateStageDto, eff: Effective | undefined, actorId: string, ip?: string) {
    assertStageScope(eff, null); // only ALL-scope holders may create a brand new stage
    const exists = await this.prisma.stage.findUnique({ where: { name: dto.name } });
    if (exists) throw new AppException('STAGE_EXISTS', 'اسم المرحلة مستخدم بالفعل', 'Stage name already in use', 409);
    const stage = await this.prisma.stage.create({ data: { name: dto.name, description: dto.description, sortOrder: dto.sortOrder ?? 0 } });
    await this.audit.log({ userId: actorId, action: 'STAGE_CREATED', entity: 'stage', entityId: stage.id, newValue: stage, ip });
    return stage;
  }

  async update(id: string, dto: UpdateStageDto, eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.get(id);
    assertStageScope(eff, id);
    const stage = await this.prisma.stage.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'STAGE_UPDATED', entity: 'stage', entityId: id, oldValue: before, newValue: stage, ip });
    return stage;
  }

  async setStatus(id: string, status: 'active' | 'inactive', eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.get(id);
    assertStageScope(eff, id);
    const stage = await this.prisma.stage.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId: actorId, action: status === 'inactive' ? 'STAGE_DISABLED' : 'STAGE_ENABLED',
      entity: 'stage', entityId: id, oldValue: { status: before.status }, newValue: { status }, ip,
    });
    return stage;
  }

  /**
   * Replaces the stage's secretary. The previous holder's assignment is
   * closed (valid_to = today), never deleted, so the history stays intact.
   */
  async setSecretary(stageId: string, userId: string, eff: Effective | undefined, actorId: string, ip?: string) {
    await this.get(stageId);
    assertStageScope(eff, stageId);
    const role = await this.prisma.role.findUniqueOrThrow({ where: { key: 'stage_secretary' } });
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.status !== 'active') throw new AppException('USER_NOT_FOUND', 'المستخدم غير موجود أو غير مفعّل', 'User not found or inactive', 404);

    const today = todayDate();
    const current = await this.prisma.userRole.findMany({
      where: { roleId: role.id, stageId, OR: [{ validTo: null }, { validTo: { gte: today } }] },
    });
    await this.prisma.$transaction([
      this.prisma.userRole.updateMany({ where: { id: { in: current.map((c) => c.id) } }, data: { validTo: today } }),
      this.prisma.userRole.create({ data: { userId, roleId: role.id, stageId, validFrom: today, assignedBy: actorId } }),
    ]);
    await this.audit.log({
      userId: actorId, action: 'STAGE_SECRETARY_CHANGED', entity: 'stage', entityId: stageId,
      oldValue: { previousHolders: current.map((c) => c.userId) }, newValue: { userId }, ip,
    });
    return { ok: true };
  }

  // ---------- classes ----------
  async listClasses(stageId: string) {
    await this.get(stageId);
    return this.prisma.class.findMany({ where: { stageId }, orderBy: { name: 'asc' } });
  }

  async createClass(stageId: string, dto: CreateClassDto, eff: Effective | undefined, actorId: string, ip?: string) {
    await this.get(stageId);
    assertStageScope(eff, stageId);
    const exists = await this.prisma.class.findUnique({ where: { stageId_name: { stageId, name: dto.name } } });
    if (exists) throw new AppException('CLASS_EXISTS', 'اسم الفصل مستخدم بالفعل في هذه المرحلة', 'Class name already in use in this stage', 409);
    const cls = await this.prisma.class.create({ data: { stageId, name: dto.name, description: dto.description } });
    await this.audit.log({ userId: actorId, action: 'CLASS_CREATED', entity: 'class', entityId: cls.id, newValue: cls, ip });
    return cls;
  }

  private async getClass(id: string) {
    const cls = await this.prisma.class.findUnique({ where: { id } });
    if (!cls) throw classNotFound();
    return cls;
  }

  async updateClass(id: string, dto: UpdateClassDto, eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.getClass(id);
    assertStageScope(eff, before.stageId);
    const cls = await this.prisma.class.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'CLASS_UPDATED', entity: 'class', entityId: id, oldValue: before, newValue: cls, ip });
    return cls;
  }

  async setClassStatus(id: string, status: 'active' | 'inactive', eff: Effective | undefined, actorId: string, ip?: string) {
    const before = await this.getClass(id);
    assertStageScope(eff, before.stageId);
    const cls = await this.prisma.class.update({ where: { id }, data: { status } });
    await this.audit.log({
      userId: actorId, action: status === 'inactive' ? 'CLASS_DISABLED' : 'CLASS_ENABLED',
      entity: 'class', entityId: id, oldValue: { status: before.status }, newValue: { status }, ip,
    });
    return cls;
  }
}
