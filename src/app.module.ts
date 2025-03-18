import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ScraperModule } from './scraper/scraper.module';
import { BotModule } from './bot/bot.module';
import { ChatController } from './chat/chat.controller';

@Module({
  imports: [ScraperModule, BotModule],
  controllers: [AppController, ChatController],
  providers: [AppService],
})
export class AppModule {}
