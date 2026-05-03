// src/appstore/appstore.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppStoreController } from './appstore.controller';
import { AppStoreService } from './appstore.service';
import { PluginRegistryService } from './plugin-registry.service';
import { ScoringService } from './scoring.service';

@Module({
  imports: [HttpModule],
  controllers: [AppStoreController],
  providers: [AppStoreService, PluginRegistryService, ScoringService],
  exports: [AppStoreService],
})
export class AppStoreModule {}
