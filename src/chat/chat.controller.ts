import { Controller, Get } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';
import { BotService } from '../bot/bot.service';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly scraperService: ScraperService,
    private readonly botService: BotService,
  ) {}

  @Get('messages')
  async getMessages() {
    await this.scraperService.init();
    const messages = await this.scraperService.getMessages();
    await this.scraperService.close();
    return messages;
  }

  @Get('reply')
  async replyToMessages() {
    await this.scraperService.init();

    const mockMessages = [
      'Bonjour ?',
      'Ca va ?',
    ];

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const generateResponseWithRetry = async (msg: string, retries = 3, delayMs = 2000) => {
      try {
        const response = await this.botService.generateResponse(msg);
        return response;
      } catch (error) {
        if (error.response && error.response.status === 429 && retries > 0) {
          console.log('Trop de requêtes, réessai dans ' + delayMs + 'ms');
          await delay(delayMs);
          return await generateResponseWithRetry(msg, retries - 1, delayMs * 2); // Double le délai à chaque échec
        } else {
          throw error;
        }
      }
    };

    const responses = await Promise.all(mockMessages.map(async (msg: string) => {
      return await generateResponseWithRetry(msg);
    }));

    await this.scraperService.close();

    return responses;
  }
}
