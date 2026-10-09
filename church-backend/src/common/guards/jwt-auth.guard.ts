import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../errors/app.exception';
import { ALLOW_PW_CHANGE, IS_PUBLIC } from '../decorators';

const unauth = () => new AppException('UNAUTHORIZED', 'يجب تسجيل الدخول', 'Authentication required', 401);

/**
 * Verifies the access token AND re-checks server state on every request:
 * session not revoked, user active, token_version unchanged.
 * That is what makes "disable user" and "logout everywhere" effective immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private jwt: JwtService, private prisma: PrismaService, private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw unauth();

    let payload: { sub: string; sid: string; tv: number };
    try {
      payload = await this.jwt.verifyAsync(header.slice(7));
    } catch {
      throw new AppException('TOKEN_EXPIRED', 'انتهت الجلسة، سجّل الدخول مجددًا', 'Token invalid or expired', 401);
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, status: true, tokenVersion: true, mustChangePassword: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) throw unauth();
    const u = session.user;
    if (u.id !== payload.sub || u.status !== 'active' || u.tokenVersion !== payload.tv) throw unauth();

    if (u.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOW_PW_CHANGE, targets)) {
      throw new AppException('PASSWORD_CHANGE_REQUIRED', 'يجب تغيير كلمة المرور أولًا', 'Password change required', 403);
    }

    req.user = { id: u.id, sessionId: session.id, deviceId: session.deviceId };
    return true;
  }
}
