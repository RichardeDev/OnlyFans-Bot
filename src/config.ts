import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  ONLYFANS_LOGIN: process.env.ONLYFANS_LOGIN || '',
  ONLYFANS_PASSWORD: process.env.ONLYFANS_PASSWORD || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
};
