import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsOptional, IsString, IsUUID,
  MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateChildDto {
  @IsString() @MinLength(1) @MaxLength(100) firstName: string;
  @IsOptional() @IsString() @MaxLength(100) middleName?: string;
  @IsString() @MinLength(1) @MaxLength(100) lastName: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsString() @MaxLength(20) fatherPhone?: string;
  @IsOptional() @IsString() @MaxLength(20) motherPhone?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() address?: string;
  @IsUUID() stageId: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsDateString() enrollmentDate?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateChildDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @MaxLength(100) middleName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) lastName?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsString() @MaxLength(20) fatherPhone?: string;
  @IsOptional() @IsString() @MaxLength(20) motherPhone?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() notes?: string;
}

export class TransferChildDto {
  @IsUUID() stageId: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsString() @MinLength(2) @MaxLength(500) reason: string;
}

export class ChildListQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'archived']) status?: string;
}

export class ChildParentLinkDto {
  @IsUUID() parentId: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
}
export class SetChildParentsDto {
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ChildParentLinkDto) parents: ChildParentLinkDto[];
}

export class CreateParentDto {
  @IsString() @MinLength(2) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsIn(['father', 'mother', 'guardian', 'other']) relationship?: string;
  @IsOptional() @IsBoolean() notificationEnabled?: boolean;
}
export class UpdateParentDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsIn(['father', 'mother', 'guardian', 'other']) relationship?: string;
  @IsOptional() @IsBoolean() notificationEnabled?: boolean;
}
export class ParentListQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
}
