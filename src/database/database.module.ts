import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaSecondService } from './prisma-second.service';

@Global()
@Module({
  providers: [PrismaService, PrismaSecondService],
  exports: [PrismaService, PrismaSecondService],
})
export class DatabaseModule {}
