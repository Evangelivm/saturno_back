import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { SunatCredentialsService } from './sunat-credentials.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { CreateCredentialSchema, type CreateCredentialDto } from './dto/create-credential.dto';
import { UpdateCredentialSchema, type UpdateCredentialDto } from './dto/update-credential.dto';

@Controller('api/sunat-credentials')
@UseGuards(AuthGuard)
export class SunatCredentialsController {
  constructor(
    private readonly credentialsService: SunatCredentialsService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body(new ZodValidationPipe(CreateCredentialSchema)) dto: CreateCredentialDto,
  ) {
    return this.credentialsService.create(user.id, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: any) {
    return this.credentialsService.findAll(user.id);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.credentialsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateCredentialSchema)) dto: UpdateCredentialDto,
  ) {
    return this.credentialsService.update(user.id, id, dto);
  }

  @Patch(':id/toggle')
  async toggle(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.credentialsService.toggle(user.id, id);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.credentialsService.remove(user.id, id);
  }
}
