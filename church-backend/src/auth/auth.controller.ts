import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { AllowWhenPasswordChangeRequired, AuthUser, ClientIp, CurrentUser, Public } from '../common/decorators';
import { ChangePasswordDto, ForgotPasswordDto, LoginDto, RefreshDto, ResetPasswordDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public() @Throttle({ default: { limit: 10, ttl: 60_000 } }) @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @ClientIp() ip?: string) { return this.auth.login(dto, ip); }

  @Public() @Throttle({ default: { limit: 30, ttl: 60_000 } }) @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @ClientIp() ip?: string) { return this.auth.refresh(dto.refreshToken, ip); }

  @AllowWhenPasswordChangeRequired() @HttpCode(200)
  @Post('logout')
  logout(@CurrentUser() u: AuthUser, @ClientIp() ip?: string) { return this.auth.logout(u.id, u.sessionId, ip); }

  @AllowWhenPasswordChangeRequired() @HttpCode(200)
  @Post('change-password')
  changePassword(@CurrentUser() u: AuthUser, @Body() dto: ChangePasswordDto, @ClientIp() ip?: string) {
    return this.auth.changePassword(u.id, u.sessionId, dto.currentPassword, dto.newPassword, ip);
  }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200)
  @Post('forgot-password')
  forgot(@Body() dto: ForgotPasswordDto, @ClientIp() ip?: string) { return this.auth.forgotPassword(dto.identifier, ip); }

  @Public() @Throttle({ default: { limit: 5, ttl: 60_000 } }) @HttpCode(200)
  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto, @ClientIp() ip?: string) { return this.auth.resetPassword(dto.token, dto.newPassword, ip); }

  @AllowWhenPasswordChangeRequired()
  @Get('me')
  me(@CurrentUser() u: AuthUser) { return this.auth.me(u.id); }
}
