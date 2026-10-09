import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID,
  Matches, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateUserDto {
  @IsString() @Matches(/^[a-zA-Z0-9._-]{3,64}$/) username: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  /** Omit to auto-generate a temporary password (returned once). */
  @IsOptional() @IsString() @MinLength(10) @MaxLength(128) password?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) roleKeys?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class RoleAssignmentDto {
  @IsString() roleKey: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
export class SetRolesDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => RoleAssignmentDto) roles: RoleAssignmentDto[];
}

export class OverrideDto {
  @IsString() permission: string;
  @IsIn(['grant', 'deny']) effect: 'grant' | 'deny';
  @IsIn(['NONE', 'OWN_RECORD', 'ASSIGNED_SESSION', 'OWN_STAGE', 'ALL']) scope: any;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}
export class SetPermissionsDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => OverrideDto) overrides: OverrideDto[];
}

export class UserListQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(['active', 'disabled', 'locked']) status?: string;
  @IsOptional() @IsString() role?: string;
}
