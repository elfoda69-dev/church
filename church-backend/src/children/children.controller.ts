import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { ChildrenService } from './children.service';
import { AuthUser, ClientIp, CurrentUser, Perms, RequirePermission } from '../common/decorators';
import { Effective } from '../rbac/resolve';
import {
  ChildListQuery, CreateChildDto, CreateParentDto, ParentListQuery, SetChildParentsDto,
  TransferChildDto, UpdateChildDto, UpdateParentDto,
} from './dto/children.dto';

const uuid = new ParseUUIDPipe();

@Controller('children')
export class ChildrenController {
  constructor(private children: ChildrenService) {}

  @Get() @RequirePermission('VIEW_CHILDREN')
  list(@Query() q: ChildListQuery, @Perms() perms: Record<string, Effective>) {
    return this.children.list(q, perms['VIEW_CHILDREN']);
  }

  @Post() @RequirePermission('EDIT_CHILDREN')
  create(@Body() dto: CreateChildDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.create(dto, perms['EDIT_CHILDREN'], a.id, ip);
  }

  @Get(':id') @RequirePermission('VIEW_CHILDREN')
  get(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser) {
    return this.children.get(id, perms['VIEW_CHILDREN'], a.id);
  }

  @Patch(':id') @RequirePermission('EDIT_CHILDREN')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateChildDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.update(id, dto, perms['EDIT_CHILDREN'], a.id, ip);
  }

  @Post(':id/deactivate') @HttpCode(200) @RequirePermission('EDIT_CHILDREN')
  deactivate(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.setStatus(id, 'inactive', perms['EDIT_CHILDREN'], a.id, ip);
  }

  @Post(':id/reactivate') @HttpCode(200) @RequirePermission('EDIT_CHILDREN')
  reactivate(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.setStatus(id, 'active', perms['EDIT_CHILDREN'], a.id, ip);
  }

  @Post(':id/transfer') @HttpCode(200) @RequirePermission('EDIT_CHILDREN')
  transfer(@Param('id', uuid) id: string, @Body() dto: TransferChildDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.transfer(id, dto, perms['EDIT_CHILDREN'], a.id, ip);
  }

  @Get(':id/timeline') @RequirePermission('VIEW_CHILDREN')
  timeline(@Param('id', uuid) id: string, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser) {
    return this.children.timeline(id, perms['VIEW_CHILDREN'], a.id);
  }

  @Put(':id/parents') @RequirePermission('EDIT_CHILDREN')
  setParents(@Param('id', uuid) id: string, @Body() dto: SetChildParentsDto, @Perms() perms: Record<string, Effective>, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.setChildParents(id, dto, perms['EDIT_CHILDREN'], a.id, ip);
  }
}

@Controller('parents')
export class ParentsController {
  constructor(private children: ChildrenService) {}

  @Get() @RequirePermission('VIEW_CHILDREN')
  list(@Query() q: ParentListQuery) { return this.children.listParents(q); }

  @Get(':id') @RequirePermission('VIEW_CHILDREN')
  get(@Param('id', uuid) id: string) { return this.children.getParent(id); }

  @Post() @RequirePermission('EDIT_CHILDREN')
  create(@Body() dto: CreateParentDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.createParent(dto, a.id, ip);
  }

  @Patch(':id') @RequirePermission('EDIT_CHILDREN')
  update(@Param('id', uuid) id: string, @Body() dto: UpdateParentDto, @CurrentUser() a: AuthUser, @ClientIp() ip?: string) {
    return this.children.updateParent(id, dto, a.id, ip);
  }
}
