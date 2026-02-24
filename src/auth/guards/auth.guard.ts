import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const sessionToken = this.extractTokenFromCookie(request);

    if (!sessionToken) {
      throw new UnauthorizedException('No se encontró token de sesión');
    }

    try {
      const session = await this.prisma.session.findUnique({
        where: { token: sessionToken },
        include: { user: true },
      });

      if (!session) {
        throw new UnauthorizedException('Sesión inválida');
      }

      if (session.expiresAt < new Date()) {
        throw new UnauthorizedException('Sesión expirada');
      }

      request.user = session.user;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Error al validar la sesión');
    }
  }

  private extractTokenFromCookie(request: any): string | undefined {
    return request.cookies?.['session_token'];
  }
}
