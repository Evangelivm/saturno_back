import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { HistorialLegacyService } from './historial-legacy.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/historial-legacy')
@UseGuards(AuthGuard)
export class HistorialLegacyController {
  constructor(private readonly historialLegacyService: HistorialLegacyService) {}

  @Get(':id/file/:tipo')
  async getFile(
    @Param('id') id: string,
    @Param('tipo') tipo: string,
    @Res() res: Response,
  ) {
    const { stream, mimeType, name } = await this.historialLegacyService.getFile(
      parseInt(id, 10),
      tipo as any,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    stream.pipe(res);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('ruc') ruc?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.historialLegacyService.findAll(user.ruc, user.role, {
      ruc,
      page: Math.max(parseInt(page ?? '1', 10) || 1, 1),
      limit: Math.min(Math.max(parseInt(limit ?? '30', 10) || 30, 1), 100),
      search,
    });
  }
}
