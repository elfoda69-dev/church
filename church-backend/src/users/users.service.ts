import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/errors/app.exception';
import { todayDate } from '../common/dates';
import { paged, skipTake } from '../common/pagination';
import { CreateUserDto, SetPermissionsDto, SetRolesDto, UpdateUserDto, UserListQuery } from './dto/users.dto';

const PUBLIC_USER = {
  id: true, username: true, phone: true, email: true, status: true,
  mustChangePassword: true, lastLoginAt: true, createdAt: true,
} as const;

const notFound = () => new AppException('USER_NOT_FOUND', 'المستخدم غير موجود', 'User not found', 404);
const genPassword = () => randomBytes(12).toString('base64url') + 'aA1';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(q: UserListQuery) {
    const where: any = {
      status: q.status as any,
      ...(q.q ? { OR: [
        { username: { contains: q.q, mode: 'insensitive' } },
        { phone: { contains: q.q } },
        { email: { contains: q.q, mode: 'insensitive' } },
      ] } : {}),
      ...(q.role ? { roles: { some: { role: { key: q.role }, OR: [{ validTo: null }, { validTo: { gte: todayDate() } }] } } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, ...skipTake(q),
        select: { ...PUBLIC_USER, roles: { where: { OR: [{ validTo: null }, { validTo: { gte: todayDate() } }] }, include: { role: { select: { key: true, nameAr: true } } } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return paged(rows, total, q);
  }

  async get(id: string) {
    const u = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER, tokenVersion: true,
        roles: { include: { role: { select: { key: true, nameAr: true } } }, orderBy: { validFrom: 'desc' } },
        permissions: { include: { permission: { select: { key: true } } } },
      },
    });
    if (!u) throw notFound();
    return u;
  }

  async create(dto: CreateUserDto, actorId: string, ip?: string) {
    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ username: dto.username }, ...(dto.phone ? [{ phone: dto.phone }] : []), ...(dto.email ? [{ email: dto.email.toLowerCase() }] : [])] },
    });
    if (exists) throw new AppException('USER_EXISTS', 'اسم المستخدم أو الهاتف أو البريد مستخدم بالفعل', 'Username/phone/email already in use', 409);

    const temp = dto.password ? undefined : genPassword();
    const user = await this.prisma.user.create({
      data: {
        username: dto.username, phone: dto.phone, email: dto.email?.toLowerCase(),
        passwordHash: await argon2.hash(dto.password ?? temp!, { type: argon2.argon2id }),
        mustChangePassword: true,
      },
      select: PUBLIC_USER,
    });
    if (dto.roleKeys?.length) {
      await this.applyRoles(user.id, dto.roleKeys.map((roleKey) => ({ roleKey })), actorId, ip);
    }
    await this.audit.log({ userId: actorId, action: 'USER_CREATED', entity: 'user', entityId: user.id, newValue: { ...user, roles: dto.roleKeys }, ip });
    return { user, temporaryPassword: temp }; // shown ONCE, never stored in plain text
  }

  async update(id: string, dto: UpdateUserDto, actorId: string, ip?: string) {
    const before = await this.get(id);
    const user = await this.prisma.user.update({
      where: { id }, data: { phone: dto.phone, email: dto.email?.toLowerCase() }, select: PUBLIC_USER,
    }).catch(() => { throw new AppException('USER_EXISTS', 'الهاتف أو البريد مستخدم بالفعل', 'Phone/email already in use', 409); });
    await this.audit.log({ userId: actorId, action: 'USER_UPDATED', entity: 'user', entityId: id,
      oldValue: { phone: before.phone, email: before.email }, newValue: { phone: user.phone, email: user.email }, ip });
    return user;
  }

  async setStatus(id: string, status: 'active' | 'disabled', actorId: string, ip?: string) {
    if (id === actorId && status === 'disabled') {
      throw new AppException('CANNOT_DISABLE_SELF', 'لا يمكنك تعطيل حسابك', 'You cannot disable yourself', 400);
    }
    const before = await this.get(id);
    if (status === 'disabled') await this.assertNotLastSuperAdmin(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { status, tokenVersion: { increment: 1 } } }),
      ...(status === 'disabled'
        ? [this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'user_disabled' } })]
        : []),
    ]);
    await this.audit.log({ userId: actorId, action: status === 'disabled' ? 'USER_DISABLED' : 'USER_ENABLED',
      entity: 'user', entityId: id, oldValue: { status: before.status }, newValue: { status }, ip });
    return { ok: true };
  }

  async logoutAll(id: string, actorId: string, ip?: string) {
    await this.get(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'admin_logout_all' } }),
    ]);
    await this.audit.log({ userId: actorId, action: 'USER_LOGOUT_ALL', entity: 'user', entityId: id, ip });
    return { ok: true };
  }

  async resetPassword(id: string, actorId: string, ip?: string) {
    await this.get(id);
    const temp = genPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await argon2.hash(temp, { type: argon2.argon2id }), mustChangePassword: true, tokenVersion: { increment: 1 } } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'admin_password_reset' } }),
    ]);
    await this.audit.log({ userId: actorId, action: 'USER_PASSWORD_RESET_BY_ADMIN', entity: 'user', entityId: id, ip });
    return { temporaryPassword: temp };
  }

  // ---------- roles ----------
  /**
   * Replaces the user's ACTIVE role assignments with the given set.
   * Removed ones are closed (valid_to = today), never deleted -> history is kept.
   */
  async setRoles(id: string, dto: SetRolesDto, actorId: string, ip?: string) {
    await this.get(id);
    const before = await this.activeAssignments(id);
    await this.applyRoles(id, dto.roles, actorId, ip);
    const after = await this.activeAssignments(id);
    await this.audit.log({ userId: actorId, action: 'USER_ROLES_CHANGED', entity: 'user', entityId: id, oldValue: before, newValue: after, ip });
    return after;
  }

  private activeAssignments(userId: string) {
    return this.prisma.userRole.findMany({
      where: { userId, OR: [{ validTo: null }, { validTo: { gte: todayDate() } }] },
      select: { id: true, stageId: true, validFrom: true, validTo: true, role: { select: { key: true } } },
    });
  }

  private async applyRoles(userId: string, wanted: SetRolesDto['roles'], actorId: string, ip?: string) {
    const today = todayDate();
    const keys = [...new Set(wanted.map((w) => w.roleKey))];
    const roles = await this.prisma.role.findMany({ where: { key: { in: keys }, status: 'active' } });
    const unknown = keys.filter((k) => !roles.find((r) => r.key === k));
    if (unknown.length) throw new AppException('ROLE_NOT_FOUND', 'دور غير موجود', `Unknown role(s): ${unknown.join(', ')}`, 400);
    const roleByKey = new Map(roles.map((r) => [r.key, r]));

    const current = await this.prisma.userRole.findMany({
      where: { userId, OR: [{ validTo: null }, { validTo: { gte: today } }] }, include: { role: true },
    });
    const same = (c: (typeof current)[number], w: SetRolesDto['roles'][number]) =>
      c.role.key === w.roleKey && (c.stageId ?? null) === (w.stageId ?? null);

    const toClose = current.filter((c) => !wanted.some((w) => same(c, w)));
    const toAdd = wanted.filter((w) => !current.some((c) => same(c, w)));

    // Never leave the system without a super admin.
    if (toClose.some((c) => c.role.key === 'super_admin')) await this.assertNotLastSuperAdmin(userId);

    // General Secretary is unique: assigning a new holder closes the previous one (history kept).
    const gsAdd = toAdd.find((w) => w.roleKey === 'general_secretary');
    const handedOver: string[] = [];
    if (gsAdd) {
      const holders = await this.prisma.userRole.findMany({
        where: { userId: { not: userId }, role: { key: 'general_secretary' }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
      });
      handedOver.push(...holders.map((h) => h.userId));
    }

    await this.prisma.$transaction([
      this.prisma.userRole.updateMany({ where: { id: { in: toClose.map((c) => c.id) } }, data: { validTo: today } }),
      ...(handedOver.length
        ? [this.prisma.userRole.updateMany({
            where: { userId: { in: handedOver }, role: { key: 'general_secretary' }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
            data: { validTo: today },
          })]
        : []),
      ...toAdd.map((w) => this.prisma.userRole.create({
        data: {
          userId, roleId: roleByKey.get(w.roleKey)!.id, stageId: w.stageId ?? null,
          validFrom: w.validFrom ? new Date(w.validFrom) : today, validTo: w.validTo ? new Date(w.validTo) : null, assignedBy: actorId,
        },
      })),
    ]);
    if (handedOver.length) {
      await this.audit.log({ userId: actorId, action: 'GENERAL_SECRETARY_TRANSFERRED', entity: 'user', entityId: userId, metadata: { previousHolders: handedOver }, ip });
    }
  }

  private async assertNotLastSuperAdmin(userId: string) {
    const today = todayDate();
    const others = await this.prisma.userRole.count({
      where: { userId: { not: userId }, role: { key: 'super_admin' }, user: { status: 'active' }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
    });
    const isSuper = await this.prisma.userRole.count({
      where: { userId, role: { key: 'super_admin' }, OR: [{ validTo: null }, { validTo: { gte: today } }] },
    });
    if (isSuper && others === 0) {
      throw new AppException('LAST_SUPER_ADMIN', 'لا يمكن إزالة آخر Super Admin', 'Cannot remove or disable the last super admin', 400);
    }
  }

  // ---------- permission overrides ----------
  async setPermissions(id: string, dto: SetPermissionsDto, actorId: string, ip?: string) {
    await this.get(id);
    const keys = [...new Set(dto.overrides.map((o) => o.permission))];
    const perms = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    const missing = keys.filter((k) => !perms.find((p) => p.key === k));
    if (missing.length) throw new AppException('PERMISSION_NOT_FOUND', 'صلاحية غير موجودة', `Unknown permission(s): ${missing.join(', ')}`, 400);
    for (const o of dto.overrides) {
      const p = perms.find((x) => x.key === o.permission)!;
      if (o.effect === 'grant' && !p.allowedScopes.includes(o.scope)) {
        throw new AppException('SCOPE_NOT_ALLOWED', 'هذا النطاق غير مسموح لهذه الصلاحية', `Scope ${o.scope} not allowed for ${o.permission}`, 400);
      }
    }
    const before = await this.prisma.userPermission.findMany({ where: { userId: id }, include: { permission: { select: { key: true } } } });
    await this.prisma.$transaction([
      this.prisma.userPermission.deleteMany({ where: { userId: id } }),
      ...dto.overrides.map((o) => this.prisma.userPermission.create({
        data: {
          userId: id, permissionId: perms.find((p) => p.key === o.permission)!.id, effect: o.effect, scope: o.scope,
          stageId: o.stageId, expiresAt: o.expiresAt ? new Date(o.expiresAt) : null, reason: o.reason, grantedBy: actorId,
        },
      })),
    ]);
    await this.audit.log({ userId: actorId, action: 'USER_PERMISSIONS_CHANGED', entity: 'user', entityId: id, oldValue: before, newValue: dto.overrides, ip });
    return { ok: true };
  }

  // ---------- sessions & devices ----------
  async sessions(id: string) {
    await this.get(id);
    return this.prisma.session.findMany({
      where: { userId: id }, orderBy: { issuedAt: 'desc' }, take: 50,
      select: { id: true, issuedAt: true, lastUsedAt: true, expiresAt: true, revokedAt: true, revokedReason: true, ip: true,
        device: { select: { id: true, deviceName: true, os: true, appVersion: true } } },
    });
  }

  async devices(id: string) {
    await this.get(id);
    return this.prisma.device.findMany({
      where: { userId: id }, orderBy: { lastActiveAt: 'desc' },
      select: { id: true, deviceName: true, os: true, osVersion: true, appVersion: true, status: true, lastActiveAt: true },
    });
  }

  async revokeSession(sessionId: string, actorId: string, ip?: string) {
    const s = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!s) throw new AppException('SESSION_NOT_FOUND', 'الجلسة غير موجودة', 'Session not found', 404);
    await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: s.revokedAt ?? new Date(), revokedReason: s.revokedReason ?? 'admin_revoked' } });
    await this.audit.log({ userId: actorId, action: 'SESSION_REVOKED', entity: 'session', entityId: sessionId, metadata: { targetUser: s.userId }, ip });
    return { ok: true };
  }

  async revokeDevice(deviceId: string, actorId: string, ip?: string) {
    const d = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!d) throw new AppException('DEVICE_NOT_FOUND', 'الجهاز غير موجود', 'Device not found', 404);
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { status: 'revoked', pushToken: null } }),
      this.prisma.session.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'device_revoked' } }),
    ]);
    await this.audit.log({ userId: actorId, action: 'DEVICE_REVOKED', entity: 'device', entityId: deviceId, metadata: { targetUser: d.userId }, ip });
    return { ok: true };
  }
}
