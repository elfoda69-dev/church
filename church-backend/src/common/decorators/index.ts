import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route stays reachable while the user still must change their password. */
export const ALLOW_PW_CHANGE = 'allowPwChange';
export const AllowWhenPasswordChangeRequired = () => SetMetadata(ALLOW_PW_CHANGE, true);

export const REQUIRE_PERMISSION = 'requirePermission';
export const RequirePermission = (key: string) => SetMetadata(REQUIRE_PERMISSION, key);

export interface AuthUser { id: string; sessionId: string; deviceId: string | null }

export const CurrentUser = createParamDecorator((_d, ctx: ExecutionContext): AuthUser =>
  ctx.switchToHttp().getRequest().user);

/** The effective-permissions map computed by PermissionsGuard for this request. */
export const Perms = createParamDecorator((_d, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest().permissions ?? {});

export const ClientIp = createParamDecorator((_d, ctx: ExecutionContext): string | undefined =>
  ctx.switchToHttp().getRequest().ip);
