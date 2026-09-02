import { Controller, ForbiddenException, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { DuckDbService } from './duckdb.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('api/admin/legacy-duckdb')
@UseGuards(AuthGuard)
export class DuckDbAdminController {
  constructor(private readonly duckDbService: DuckDbService) {}

  // Fuerza un refresco manual de clientes2024 en DuckDB sin esperar el intervalo periódico.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@CurrentUser() user: any) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    await this.duckDbService.refresh();
    return { message: 'Refresco de clientes2024 en DuckDB completado' };
  }
}
