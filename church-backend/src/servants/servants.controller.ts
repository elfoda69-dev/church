import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ServantsService } from './servants.service';
import { AuthUser, ClientIp, CurrentUser, Perms, RequirePermission } from '../common/decorators';
import { Effective } from '../rbac/resolve';
import { CreateServantDto, ServantListQuery, SetAssignmentsDto, UpdateServantDto } from './dto/servants.dto';

const uuid = new ParseUUIDPipe();

@Controller('servants')
export class ServantsController {
  constructor(private servants: ServantsService) {}

  @Get() @RequirePermission('VIEW_SERVANTS')
  list(@Query() q: ServantListQuery, @Perms() perms: Record<string, Effective>) {
    return this.servants.list(q, perms['VIEW_SERVANTS']);
  }

  @Post() @RequirePermission('EDIT_SERVANTS')
  create(@Body() dto: CreateServantDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.servants.create(dto, a.id, ip);
  }

  @Get(':id') @RequirePermission('VIEW_SERVANTS')
  get(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>) {
    return this.servants.get(id, perms['VIEW_SERVANTS']);
  }

  @Patch(':id') @RequirePermission('EDIT_SERVANTS')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateServantDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.servants.update(id, dto, a.id, ip);
  }

  @Post(':id/disable') @HttpCode(200) @RequirePermission('EDIT_SERVANTS')
  disable(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.servants.setStatus(id, 'inactive', a.id, ip);
  }

  @Post(':id/enable') @HttpCode(200) @RequirePermission('EDIT_SERVANTS')
  enable(@Param('id', uuid) id: string, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.servants.setStatus(id, 'active', a.id, ip);
  }

  @Put(':id/assignments') @RequirePermission('EDIT_SERVANTS')
  setAssignments(@Param('id', uuid) id: string, @Body() dto: SetAssignmentsDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.servants.setAssignments(id, dto, perms['EDIT_SERVANTS'], a.id, ip);
  }
}
