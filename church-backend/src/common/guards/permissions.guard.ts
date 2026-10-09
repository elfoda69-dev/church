import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../rbac/rbac.service';
import { AppException } from '../errors/app.exception';
import { REQUIRE_PERMISSION } from '../decorators';

/**
 * Server-side permission check. Attaches `req.permissions` (key -> {scope, stageIds})
 * so services can enforce SCOPE against the concrete resource (own stage, assigned session...).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private rbac: RbacService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION, [ctx.getHandler(), ctx.getClass()]);
    if (!key) return true;
    const req = ctx.switchToHttp().getRequest();
    if (!req.user) return false;
    const effective = await this.rbac.getEffective(req.user.id);
    req.permissions = effective;
    if (!effective[key]) {
      throw new AppException('FORBIDDEN', 'ليست لديك صلاحية لتنفيذ هذا الإجراء', `Missing permission ${key}`, 403);
    }
    return true;
  }
}
