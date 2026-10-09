import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RbacService } from '../rbac/rbac.service';
import { AppException } from '../common/errors/app.exception';
import { DeviceInfoDto, LoginDto } from './dto/auth.dto';

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newToken = () => randomBytes(48).toString('base64url');
const DAY = 86_400_000;

const invalidCreds = () => new AppException('INVALID_CREDENTIALS', 'بيانات الدخول غير صحيحة', 'Invalid credentials', 401);
const invalidRefresh = () => new AppException('INVALID_REFRESH_TOKEN', 'انتهت الجلسة، سجّل الدخول مجددًا', 'Invalid refresh token', 401);

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  private dummyHash: string; // equalises timing for unknown users

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private cfg: ConfigService,
    private audit: AuditService,
    private rbac: RbacService,
  ) {}

  async onModuleInit() { this.dummyHash = await argon2.hash('dummy-password-for-timing'); }

  private get maxFailed() { return Number(this.cfg.get('MAX_FAILED_LOGINS', 5)); }
  private get lockMs() { return Number(this.cfg.get('LOCK_MINUTES', 15)) * 60_000; }
  private get refreshMs() { return Number(this.cfg.get('REFRESH_TTL_DAYS', 30)) * DAY; }

  // ---------- login ----------
  async login(dto: LoginDto, ip?: string) {
    const id = dto.identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: id }, { phone: id }, { email: id.toLowerCase() }] },
    });

    if (!user || !user.passwordHash) {
      await argon2.verify(this.dummyHash, dto.password).catch(() => false);
      await this.audit.log({ action: 'LOGIN_FAILED', entity: 'user', ip, metadata: { reason: 'unknown_user' } });
      throw invalidCreds();
    }
    if (user.status !== 'active') {
      await this.audit.log({ userId: user.id, action: 'LOGIN_BLOCKED', entity: 'user', entityId: user.id, ip, metadata: { status: user.status } });
      throw new AppException('ACCOUNT_DISABLED', 'هذا الحساب معطّل', 'Account disabled', 403);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException('ACCOUNT_LOCKED', 'الحساب مقفل مؤقتًا بسبب محاولات فاشلة', 'Account temporarily locked', 403,
        { lockedUntil: user.lockedUntil });
    }

    const ok = await argon2.verify(user.passwordHash, dto.password).catch(() => false);
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= this.maxFailed;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + this.lockMs) : null },
      });
      await this.audit.log({ userId: user.id, action: lock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED', entity: 'user', entityId: user.id, ip });
      throw invalidCreds();
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    const device = dto.device ? await this.upsertDevice(user.id, dto.device) : null;
    const tokens = await this.createSession(user.id, user.tokenVersion, device?.id ?? null, ip);
    await this.audit.log({ userId: user.id, action: 'LOGIN', entity: 'user', entityId: user.id, ip, deviceId: device?.id });
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  private async upsertDevice(userId: string, d: DeviceInfoDto) {
    const existing = await this.prisma.device.findUnique({ where: { userId_fingerprint: { userId, fingerprint: d.fingerprint } } });
    if (existing?.status === 'revoked') {
      throw new AppException('DEVICE_REVOKED', 'هذا الجهاز تم إيقافه', 'Device revoked', 403);
    }
    const data = { deviceName: d.deviceName, os: d.os, osVersion: d.osVersion, appVersion: d.appVersion, pushToken: d.pushToken, lastActiveAt: new Date() };
    return this.prisma.device.upsert({
      where: { userId_fingerprint: { userId, fingerprint: d.fingerprint } },
      create: { userId, fingerprint: d.fingerprint, ...data },
      update: data,
    });
  }

  private signAccess(userId: string, sessionId: string, tv: number) {
    return this.jwt.signAsync({ sub: userId, sid: sessionId, tv });
  }

  private async createSession(userId: string, tv: number, deviceId: string | null, ip?: string) {
    const refreshToken = newToken();
    const session = await this.prisma.session.create({
      data: { userId, deviceId, refreshTokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + this.refreshMs), ip },
    });
    return { accessToken: await this.signAccess(userId, session.id, tv), refreshToken };
  }

  // ---------- refresh (rotation + reuse detection) ----------
  async refresh(refreshToken: string, ip?: string) {
    const h = sha256(refreshToken);
    const s = await this.prisma.session.findUnique({ where: { refreshTokenHash: h }, include: { user: true } });

    if (!s) {
      // An OLD token being replayed means it was stolen or leaked -> kill that session.
      const reused = await this.prisma.session.findFirst({ where: { previousRefreshHash: h, revokedAt: null } });
      if (reused) {
        await this.prisma.session.update({ where: { id: reused.id }, data: { revokedAt: new Date(), revokedReason: 'refresh_reuse_detected' } });
        await this.audit.log({ userId: reused.userId, action: 'REFRESH_REUSE_DETECTED', entity: 'session', entityId: reused.id, ip });
      }
      throw invalidRefresh();
    }
    if (s.revokedAt || s.expiresAt < new Date() || s.user.status !== 'active') throw invalidRefresh();

    const next = newToken();
    await this.prisma.session.update({
      where: { id: s.id },
      data: { previousRefreshHash: h, refreshTokenHash: sha256(next), lastUsedAt: new Date(), ip },
    });
    if (s.deviceId) await this.prisma.device.update({ where: { id: s.deviceId }, data: { lastActiveAt: new Date() } }).catch(() => null);
    return { accessToken: await this.signAccess(s.userId, s.id, s.user.tokenVersion), refreshToken: next };
  }

  // ---------- logout ----------
  async logout(userId: string, sessionId: string, ip?: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, userId }, data: { revokedAt: new Date(), revokedReason: 'logout' } });
    await this.audit.log({ userId, action: 'LOGOUT', entity: 'session', entityId: sessionId, ip });
    return { ok: true };
  }

  // ---------- change / forgot / reset password ----------
  async changePassword(userId: string, sessionId: string, current: string, next: string, ip?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await argon2.verify(user.passwordHash, current).catch(() => false))) {
      throw new AppException('WRONG_PASSWORD', 'كلمة المرور الحالية غير صحيحة', 'Current password is incorrect', 400);
    }
    await this.setPassword(userId, next, sessionId);
    await this.audit.log({ userId, action: 'PASSWORD_CHANGED', entity: 'user', entityId: userId, ip });
    return { ok: true };
  }

  /** Sets password, clears the must-change flag, and revokes every OTHER session. */
  private async setPassword(userId: string, password: string, keepSessionId?: string) {
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: hash, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' },
      }),
    ]);
  }

  async forgotPassword(identifier: string, ip?: string) {
    const id = identifier.trim();
    const user = await this.prisma.user.findFirst({
      where: { status: 'active', OR: [{ username: id }, { phone: id }, { email: id.toLowerCase() }] },
    });
    if (user) {
      const token = newToken();
      await this.prisma.passwordReset.create({
        data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
      });
      await this.audit.log({ userId: user.id, action: 'PASSWORD_RESET_REQUESTED', entity: 'user', entityId: user.id, ip });
      // TODO Phase 10: deliver through NotificationChannel (SMS/Email). Dev only: log it.
      if (this.cfg.get('NODE_ENV') !== 'production') this.logger.warn(`[DEV] reset token for ${user.username}: ${token}`);
    }
    // Same answer whether or not the user exists (prevents account enumeration).
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string, ip?: string) {
    const r = await this.prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
    if (!r || r.usedAt || r.expiresAt < new Date()) {
      throw new AppException('INVALID_RESET_TOKEN', 'رابط الاستعادة غير صالح أو منتهي', 'Invalid or expired reset token', 400);
    }
    await this.setPassword(r.userId, newPassword);
    await this.prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } });
    await this.audit.log({ userId: r.userId, action: 'PASSWORD_RESET_DONE', entity: 'user', entityId: r.userId, ip });
    return { ok: true };
  }

  // ---------- me ----------
  async me(userId: string) {
    const [user, roles, permissions] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, username: true, phone: true, email: true, status: true, mustChangePassword: true, lastLoginAt: true },
      }),
      this.rbac.activeRoleKeys(userId),
      this.rbac.getEffective(userId),
    ]);
    // The app uses `permissions` only to decide which screens to show; the server re-checks everything.
    return { ...user, roles, permissions };
  }
}
