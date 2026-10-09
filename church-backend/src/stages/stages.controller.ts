import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { StagesService } from './stages.service';
import { AuthUser, ClientIp, CurrentUser, Perms, RequirePermission } from '../common/decorators';
import { Effective } from '../rbac/resolve';
import { CreateClassDto, CreateStageDto, SetSecretaryDto, StageListQuery, UpdateClassDto, UpdateStageDto } from './dto/stages.dto';

const uuid = new ParseUUIDPipe();

@Controller()
export class StagesController {
  constructor(private stages: StagesService) {}

  // Reading the stage/class list needs no special permission: every screen
  // in the app (dropdowns, filters, a child's own profile) needs it.
  @Get('stages')
  list(@Query() q: StageListQuery) { return this.stages.list(q); }

  @Get('stages/:id')
  get(@Param('id', uuid) id: string) { return this.stages.get(id); }

  @Post('stages') @RequirePermission('MANAGE_STAGE')
  create(@Body() dto: CreateStageDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.create(dto, perms['MANAGE_STAGE'], a.id, ip);
  }

  @Patch('stages/:id') @RequirePermission('MANAGE_STAGE')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateStageDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.update(id, dto, perms['MANAGE_STAGE'], a.id, ip);
  }

  @Post('stages/:id/disable') @HttpCode(200) @RequirePermission('MANAGE_STAGE')
  disable(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.setStatus(id, 'inactive', perms['MANAGE_STAGE'], a.id, ip);
  }

  @Post('stages/:id/enable') @HttpCode(200) @RequirePermission('MANAGE_STAGE')
  enable(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.setStatus(id, 'active', perms['MANAGE_STAGE'], a.id, ip);
  }

  @Put('stages/:id/secretary') @HttpCode(200) @RequirePermission('MANAGE_STAGE')
  setSecretary(@Param('id', uuid) id: string, @Body() dto: SetSecretaryDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.setSecretary(id, dto.userId, perms['MANAGE_STAGE'], a.id, ip);
  }

  // ---------- classes ----------
  @Get('stages/:id/classes')
  listClasses(@Param('id', uuid) id: string) { return this.stages.listClasses(id); }

  @Post('stages/:id/classes') @RequirePermission('MANAGE_STAGE')
  createClass(@Param('id', uuid) id: string, @Body() dto: CreateClassDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.createClass(id, dto, perms['MANAGE_STAGE'], a.id, ip);
  }

  @Patch('classes/:id') @RequirePermission('MANAGE_STAGE')
  updateClass(@Param('id', uuid) id: string, @Body() dto: UpdateClassDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.updateClass(id, dto, perms['MANAGE_STAGE'], a.id, ip);
  }

  @Post('classes/:id/disable') @HttpCode(200) @RequirePermission('MANAGE_STAGE')
  disableClass(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.setClassStatus(id, 'inactive', perms['MANAGE_STAGE'], a.id, ip);
  }

  @Post('classes/:id/enable') @HttpCode(200) @RequirePermission('MANAGE_STAGE')
  enableClass(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.stages.setClassStatus(id, 'active', perms['MANAGE_STAGE'], a.id, ip);
  }
}
