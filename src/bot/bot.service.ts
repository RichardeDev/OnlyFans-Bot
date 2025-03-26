import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class BotService {
  private apiUrl: string;
  private apiKey: string;

  constructor() {
    this.apiUrl = process.env.MISTRAL_API_URL ||  ''; 
    this.apiKey = process.env.MISTRAL_API_KEY || ''; 
  }

  async generateResponse(message: string): Promise<string> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: 'mistral-large-latest',  
          messages: [
            {
              role: 'user',  
              content: message,
            },
          ],
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
        }
      );

      return response.data?.choices?.[0]?.message?.content || '😊';
    } catch (error) {
      if (error.response && error.response.status === 429) {
        throw new Error('Rate limit exceeded');
      } else {
        console.error('Erreur de l\'API Mistral:', error);
        return '😊';
      }
    }
  }

  async generateResponseWithRetry(msg: string, retries = 3, delayMs = 2000) {
    const delay = (ms: number)=> {new Promise(resolve => setTimeout(resolve, ms))};
  
    while (retries > 0) {
      try {
        const response = await this.generateResponse(msg);
        return response;
      } catch (error) {
        if (error.message === 'Rate limit exceeded' && retries > 0) {
          console.log('Trop de requêtes, réessai dans ' + delayMs + 'ms');
          await delay(delayMs);
          retries--;
          delayMs *= 2; 
        } else {
          console.error('Erreur lors de la génération de la réponse:', error);
          throw error;
        }
      }
    }
    return '😊';
  }
}
