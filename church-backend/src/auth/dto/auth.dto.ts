import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export class DeviceInfoDto {
  @IsString() @MaxLength(200) fingerprint: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
  @IsOptional() @IsString() @MaxLength(50) os?: string;
  @IsOptional() @IsString() @MaxLength(50) osVersion?: string;
  @IsOptional() @IsString() @MaxLength(50) appVersion?: string;
  @IsOptional() @IsString() @MaxLength(500) pushToken?: string;
}

export class LoginDto {
  @IsString() @IsNotEmpty() @MaxLength(255) identifier: string; // username | phone | email
  @IsString() @IsNotEmpty() @MaxLength(128) password: string;
  @IsOptional() @ValidateNested() @Type(() => DeviceInfoDto) device?: DeviceInfoDto;
}

export class RefreshDto { @IsString() @IsNotEmpty() refreshToken: string; }
export class LogoutDto { @IsOptional() @IsString() refreshToken?: string; }

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
export class ForgotPasswordDto { @IsString() @IsNotEmpty() @MaxLength(255) identifier: string; }
export class ResetPasswordDto {
  @IsString() @IsNotEmpty() token: string;
  @IsString() @MinLength(10) @MaxLength(128) newPassword: string;
}
