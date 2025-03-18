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

      return response.data?.choices?.[0]?.message?.content || 'Je ne peux pas répondre pour l’instant.';
    } catch (error) {
      console.error('Erreur de l\'API Mistral:', error);
      return 'Je ne peux pas répondre pour l’instant.';
    }
  }
}
