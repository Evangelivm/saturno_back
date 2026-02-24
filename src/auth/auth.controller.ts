import { Controller, Post, Body, Get, Req, Res, Delete, Put, Param } from '@nestjs/common';
import type { CreateUserDto } from './dto/create-user.dto';
import { CreateUserSchema } from './dto/create-user.dto';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import type { LoginDto } from './dto/login.dto';
import { LoginSchema } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { RegisterSchema } from './dto/register.dto';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(RegisterSchema)) dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.register(dto);

    // Establecer cookie httpOnly
    // En desarrollo, sameSite se deshabilita para permitir cookies cross-origin en localhost
    const cookieOptions: any = {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    };

    if (process.env.NODE_ENV === 'production') {
      cookieOptions.secure = true;
      cookieOptions.sameSite = 'strict';
    }

    response.cookie('session_token', result.token, cookieOptions);

    // Solo devolver los datos del usuario, no el token
    return { user: result.user };
  }

  @Public()
  @Post('login')
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    // Establecer cookie httpOnly
    // En desarrollo, sameSite se deshabilita para permitir cookies cross-origin en localhost
    const cookieOptions: any = {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    };

    if (process.env.NODE_ENV === 'production') {
      cookieOptions.secure = true;
      cookieOptions.sameSite = 'strict';
    }

    response.cookie('session_token', result.token, cookieOptions);

    // Solo devolver los datos del usuario, no el token
    return { user: result.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = request.cookies['session_token'];

    if (token) {
      await this.authService.logout(token);
    }

    // Limpiar la cookie
    response.clearCookie('session_token');

    return { message: 'Sesión cerrada exitosamente' };
  }

  @Get('me')
  async getCurrentUser(@Req() request: any) {
    // El usuario está disponible en request.user gracias al AuthGuard
    return request.user;
  }

  @Post('users')
  async createUser(
    @Body(new ZodValidationPipe(CreateUserSchema)) dto: CreateUserDto,
    @Req() request: any,
  ) {
    return this.authService.createUser(request.user.id, dto);
  }

  @Get('users')
  async getUsers(@Req() request: any) {
    return this.authService.getUsers(request.user.id);
  }

  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() request: any) {
    return this.authService.deleteUser(request.user.id, id);
  }

  @Put('users/:id/reset-password')
  async resetPassword(@Param('id') id: string, @Req() request: any) {
    return this.authService.resetPassword(request.user.id, id);
  }
}
