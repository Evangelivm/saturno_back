import { Injectable, UnauthorizedException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    // Verificar si el RUC ya existe
    const existingUser = await this.prisma.user.findUnique({
      where: { ruc: dto.ruc },
    });

    if (existingUser) {
      throw new ConflictException('El RUC ya está registrado');
    }

    // Hashear contraseña
    const passwordHash = await argon2.hash(dto.password);

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        ruc: dto.ruc,
        passwordHash,
        nombreEmpresa: dto.nombreEmpresa,
      },
    });

    // Crear sesión
    const session = await this.createSession(user.id);

    return {
      user: {
        id: user.id,
        ruc: user.ruc,
        nombreEmpresa: user.nombreEmpresa,
        role: user.role,
      },
      token: session.token,
    };
  }

  async login(dto: LoginDto) {
    // Buscar usuario por RUC
    const user = await this.prisma.user.findUnique({
      where: { ruc: dto.ruc },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Verificar contraseña
    const passwordValid = await argon2.verify(user.passwordHash, dto.password);

    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Crear sesión
    const session = await this.createSession(user.id);

    return {
      user: {
        id: user.id,
        ruc: user.ruc,
        nombreEmpresa: user.nombreEmpresa,
        role: user.role,
      },
      token: session.token,
    };
  }

  async logout(token: string) {
    await this.prisma.session.delete({
      where: { token },
    });

    return { message: 'Sesión cerrada exitosamente' };
  }

  private async createSession(userId: string) {
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 días de expiración

    const session = await this.prisma.session.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return session;
  }

  async createUser(adminId: string, dto: CreateUserDto) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los administradores pueden crear usuarios');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { ruc: dto.ruc },
    });

    if (existingUser) {
      throw new ConflictException('El RUC ya está registrado');
    }

    const passwordHash = await argon2.hash('Proveedores2026@');

    const user = await this.prisma.user.create({
      data: {
        ruc: dto.ruc,
        passwordHash,
        nombreEmpresa: dto.nombreEmpresa,
        role: dto.role ?? 'USUARIO',
      },
    });

    return {
      id: user.id,
      ruc: user.ruc,
      nombreEmpresa: user.nombreEmpresa,
      role: user.role,
    };
  }

  async getUsers(adminId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los administradores pueden ver los usuarios');
    }

    return this.prisma.user.findMany({
      select: {
        id: true,
        ruc: true,
        nombreEmpresa: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteUser(adminId: string, targetId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los administradores pueden eliminar usuarios');
    }

    if (adminId === targetId) {
      throw new ForbiddenException('No se puede eliminar la cuenta propia');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });

    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }

    await this.prisma.user.delete({ where: { id: targetId } });

    return { message: 'Usuario eliminado exitosamente' };
  }

  async resetPassword(adminId: string, targetId: string) {
    const admin = await this.prisma.user.findUnique({ where: { id: adminId } });

    if (!admin || admin.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los administradores pueden resetear contraseñas');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetId } });

    if (!target) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const passwordHash = await argon2.hash('Proveedores2026@');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { passwordHash },
    });

    return { message: 'Contraseña reseteada exitosamente' };
  }

  async validateSession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Sesión inválida');
    }

    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Sesión expirada');
    }

    return session.user;
  }
}
