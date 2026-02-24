import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { CreateCredentialDto } from './dto/create-credential.dto';
import type { UpdateCredentialDto } from './dto/update-credential.dto';

@Injectable()
export class SunatCredentialsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateCredentialDto) {
    // Verificar si ya existe una credencial con el mismo clientId para este usuario
    const existing = await this.prisma.sunatCredential.findUnique({
      where: {
        userId_clientId: {
          userId,
          clientId: dto.clientId,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe una credencial con este Client ID');
    }

    // Crear la nueva credencial
    return this.prisma.sunatCredential.create({
      data: {
        userId,
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        appName: dto.appName,
        appUrl: dto.appUrl,
        isActive: true,
      },
      select: {
        id: true,
        clientId: true,
        appName: true,
        appUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // NO exponer el clientSecret en la respuesta
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.sunatCredential.findMany({
      where: { userId },
      select: {
        id: true,
        clientId: true,
        appName: true,
        appUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // NO exponer el clientSecret
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(userId: string, id: string) {
    const credential = await this.prisma.sunatCredential.findFirst({
      where: {
        id,
        userId,
      },
      select: {
        id: true,
        clientId: true,
        appName: true,
        appUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!credential) {
      throw new NotFoundException('Credencial no encontrada');
    }

    return credential;
  }

  async update(userId: string, id: string, dto: UpdateCredentialDto) {
    // Verificar que la credencial existe y pertenece al usuario
    await this.findOne(userId, id);

    // Si se está actualizando el clientId, verificar que no exista duplicado
    if (dto.clientId) {
      const existing = await this.prisma.sunatCredential.findFirst({
        where: {
          userId,
          clientId: dto.clientId,
          id: { not: id },
        },
      });

      if (existing) {
        throw new ConflictException('Ya existe una credencial con este Client ID');
      }
    }

    return this.prisma.sunatCredential.update({
      where: { id },
      data: {
        clientId: dto.clientId,
        clientSecret: dto.clientSecret,
        appName: dto.appName,
        appUrl: dto.appUrl,
      },
      select: {
        id: true,
        clientId: true,
        appName: true,
        appUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async toggle(userId: string, id: string) {
    // Verificar que la credencial existe y pertenece al usuario
    const credential = await this.findOne(userId, id);

    return this.prisma.sunatCredential.update({
      where: { id },
      data: {
        isActive: !credential.isActive,
      },
      select: {
        id: true,
        clientId: true,
        appName: true,
        appUrl: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async remove(userId: string, id: string) {
    // Verificar que la credencial existe y pertenece al usuario
    await this.findOne(userId, id);

    await this.prisma.sunatCredential.delete({
      where: { id },
    });

    return { message: 'Credencial eliminada exitosamente' };
  }
}
