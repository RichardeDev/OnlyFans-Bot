import { Controller, Get } from '@nestjs/common';
import { ScraperService } from '../scraper/scraper.service';
import { BotService } from '../bot/bot.service';
import axios from 'axios';

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

    const messages = await this.scraperService.getMessages();
    await this.scraperService.close();

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Fonction pour envoyer un message avec gestion des erreurs
    const sendMessageWithRetry = async (idMesg: string, msgReply: string, retries = 3, delayMs = 2000) => {
      
      const url = `https://onlyfans.com/api2/v2/chats/${idMesg}/messages`;

      const timestamp = Date.now();
      const timestampModified = timestamp.toString();
      const headers = { 
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'fr,fr-FR;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
        'app-token': '33d57ade8c02dbc5a333db99ff9ae26a',
        'content-type': 'application/json',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'sign': '38772:82a129afd8394a0ff9473236e2d5addc1bdbc558:7b0:67dd85ab',
        'time': timestampModified,
        'user-id': '485019792',
        'x-bc': 'ff00b1c8a927081e73028fb72289e84535d33857',
        'x-hash': 'HUziOCgr1KvTEBVlKm+PwZKeQL9rnwwQO8BIp7c=',
        'x-of-rev': '202503211528-8728c0cb7a'
      };
      
      const data = {
        text: `<p>It's not the case</p>`,
        lockedText: false,
        mediaFiles: [],
        price: 0,
        previews: [],
        rfTag: [],
        rfGuest: [],
        rfPartner: [],
        isForward: false
      };
      
      const cookies = 'fp=ff00b1c8a927081e73028fb72289e84535d33857; csrf=y3CfHMdv9a5be2562a0d9c643c51ffba618c01d9; lang=fr; st=56fc1d19f1f2aa26b76a8d30a0905ed1535cc9c2a026010dba3fd226afc3a5b1; _cfuvid=56bsP.jt4KfhaxtakotdTUUf.muK0fXxN4DeYKPxRwI-1742816467478-0.0.1.1-604800000; sess=f2p3asl17hqegs1okg9j53jrn8; auth_id=485019792; __cf_bm=TxGjU6igBxGCekdWk2_BOsmJxJdsa4pvA.IMD1mtZlg-1742895333-1.0.1.1-84UYukN0B657Q5W62s.1zwkk3mIS3IKQCBsP0rrI6GGUB.Fb4ucbI2U_J2Ls85RE6w6tLzvhsl1w99UrcqQXAfcL1qcUnu4jxgcgpbxIFqA';
      headers['cookie'] = cookies;
      try {
        const response = await axios.post(url, data, { headers });
        return response.data;
      } catch (error) {
        if (error.response && (error.response.status === 409 || error.response.status === 400)) {
          console.log(`Erreur ${error.response.status}, réessai dans ${delayMs}ms`);
          if (retries > 0) {
            await delay(delayMs);
            return await sendMessageWithRetry(idMesg, msgReply, retries - 1, delayMs * 2);
          }
        }
        console.error('Erreur lors de l\'envoi du message:', error);
        throw error;
      }
    };
    interface Message {
      withUser: {
        id: string;
      };
      lastMessage: {
        text: string;
      };
    }

    const responses = await Promise.all(
      messages.map(async (msg: Message) => {
        try {
          const msgPrompting = "Il faut repondre comme si tu etais une vraie personne, et non en repondant comme un bot. Il ne faut pas etre trop serviable pour ne pas Reviller les soupçons.epond avec deux phases maximum. Repond en une simple reponse. Le message à laquel tu dois repondre est : ";
          const msgModified = msgPrompting + msg.lastMessage.text;
          const msgReply = await this.botService.generateResponseWithRetry(msgModified);
          const idMesg = msg.withUser.id;
          return await sendMessageWithRetry(idMesg, msgReply);
        } catch (error) {
          console.error(`Erreur pour le message ID ${msg.withUser.id}:`, error);
          return null;
        }
      })
    );
    

    return responses;
  }
}
