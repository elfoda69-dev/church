import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthUser, ClientIp, CurrentUser, RequirePermission } from '../common/decorators';
import { CreateUserDto, SetPermissionsDto, SetRolesDto, UpdateUserDto, UserListQuery } from './dto/users.dto';

const uuid = new ParseUUIDPipe();

@Controller()
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('users') @RequirePermission('MANAGE_USERS')
  list(@Query() q: UserListQuery) { return this.users.list(q); }

  @Post('users') @RequirePermission('MANAGE_USERS')
  create(@Body() dto: CreateUserDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.create(dto, a.id, ip); }

  @Get('users/:id') @RequirePermission('MANAGE_USERS')
  get(@Param('id', uuid) id: string) { return this.users.get(id); }

  @Patch('users/:id') @RequirePermission('MANAGE_USERS')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateUserDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.update(id, dto, a.id, ip); }

  @Post('users/:id/disable') @HttpCode(200) @RequirePermission('MANAGE_USERS')
  disable(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.setStatus(id, 'disabled', a.id, ip); }

  @Post('users/:id/enable') @HttpCode(200) @RequirePermission('MANAGE_USERS')
  enable(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.setStatus(id, 'active', a.id, ip); }

  @Post('users/:id/logout-all') @HttpCode(200) @RequirePermission('MANAGE_USERS')
  logoutAll(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.logoutAll(id, a.id, ip); }

  @Post('users/:id/reset-password') @HttpCode(200) @RequirePermission('MANAGE_USERS')
  resetPassword(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.resetPassword(id, a.id, ip); }

  @Put('users/:id/roles') @RequirePermission('MANAGE_ROLES')
  setRoles(@Param('id', uuid) id: string, @Body() dto: SetRolesDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.setRoles(id, dto, a.id, ip); }

  @Put('users/:id/permissions') @RequirePermission('MANAGE_ROLES')
  setPermissions(@Param('id', uuid) id: string, @Body() dto: SetPermissionsDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.setPermissions(id, dto, a.id, ip); }

  @Get('users/:id/sessions') @RequirePermission('MANAGE_USERS')
  sessions(@Param('id', uuid) id: string) { return this.users.sessions(id); }

  @Get('users/:id/devices') @RequirePermission('MANAGE_DEVICES')
  devices(@Param('id', uuid) id: string) { return this.users.devices(id); }

  @Post('sessions/:id/revoke') @HttpCode(200) @RequirePermission('MANAGE_USERS')
  revokeSession(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.revokeSession(id, a.id, ip); }

  @Post('devices/:id/revoke') @HttpCode(200) @RequirePermission('MANAGE_DEVICES')
  revokeDevice(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) { return this.users.revokeDevice(id, a.id, ip); }
}
