import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested,
} from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateServantDto {
  @IsString() @MinLength(2) @MaxLength(200) fullName: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsDateString() serviceStartDate?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsUUID() userId?: string; // links to an existing login account, if any
}
export class UpdateServantDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) fullName?: string;
  @IsOptional() @IsString() @MaxLength(20) mobile?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsDateString() serviceStartDate?: string;
  @IsOptional() @IsString() notes?: string;
}
export class ServantListQuery extends PageQuery {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() stageId?: string;
  @IsOptional() @IsIn(['active', 'inactive', 'archived']) status?: string;
}

export class AssignmentDto {
  @IsUUID() stageId: string;
  @IsOptional() @IsUUID() classId?: string;
  @IsOptional() @IsString() @MaxLength(100) roleTitle?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
export class SetAssignmentsDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => AssignmentDto) assignments: AssignmentDto[];
}
