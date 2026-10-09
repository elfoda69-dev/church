import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../../common/pagination';

export class CreateStageDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class UpdateStageDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}
export class StageListQuery extends PageQuery {
  @IsOptional() @IsIn(['active', 'inactive', 'archived']) status?: string;
}
export class SetSecretaryDto {
  @IsUUID() userId: string;
}

export class CreateClassDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() description?: string;
}
export class UpdateClassDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() description?: string;
}
