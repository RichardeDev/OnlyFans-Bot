import { Injectable } from '@nestjs/common';
import * as puppeteer from 'puppeteer';
import * as dotenv from 'dotenv';
import { config } from 'src/config';
import axios from 'axios';
import { Twilio } from 'twilio';
import * as fs from 'fs';

dotenv.config();

@Injectable()
export class ScraperService {
  private browser: puppeteer.Browser;

  async init() {
    this.browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null,
      timeout: 960000
    });
  }

  async loginToOnlyFans() {
    const page = await this.browser.newPage();
    
    const cookiesPath = 'cookies.json';
    if (fs.existsSync(cookiesPath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiesPath, 'utf-8'));
      await page.setCookie(...cookies);
      console.log('Cookies chargés');
    }
  
    try {
      await page.goto('https://onlyfans.com/', { waitUntil: 'networkidle2', timeout: 240000 });
  
      const isLoggedIn = await page.evaluate(() => {
        return !!document.querySelector('.logged-in-element');
      });
  
      if (!isLoggedIn) {
        console.log('Connexion nécessaire');
        
        await page.type('input[name="email"]', config.ONLYFANS_LOGIN);
        await page.type('input[name="password"]', config.ONLYFANS_PASSWORD);
        await page.click('button[type="submit"]');
  
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 240000 });
  
        const cookies = await page.cookies();
        fs.writeFileSync(cookiesPath, JSON.stringify(cookies));
        console.log('Cookies sauvegardés');
      } else {
        console.log('Utilisateur déjà connecté');
      }
    } catch (error) {
      console.error('Erreur lors de la navigation ou de la connexion:', error);
      throw error;
    }
  
    const captcha = await page.$('iframe[src*="google.com/recaptcha"]');
    if (captcha) {
      console.log('Captcha détecté, besoin de le résoudre...');
      await this.handleCaptcha(page);
    }
  
    const twoFactorPage = await page.$('input[name="verification_code"]');
    if (twoFactorPage) {
      console.log('2FA détecté, récupération du code...');
      await this.handle2FA(page);
    }
  
    return page;
  }
  
  async handleCaptcha(page: puppeteer.Page) {
    const captchaSolution = await this.solveCaptcha(page);
    
    if (captchaSolution) {
      console.log('Captcha résolu');
      await page.evaluate((solution: string) => {
        const captchaInput = document.querySelector<HTMLInputElement>('#g-recaptcha-response');
        const boutonSubmit = document.querySelector<HTMLInputElement>('button[type="submit"]');
        if (captchaInput && boutonSubmit) {
          captchaInput.value = solution;
          boutonSubmit.click();
        }
      }, captchaSolution);

      await page.waitForNavigation();
    }
  }

  async solveCaptcha(page: puppeteer.Page): Promise<string | null> {
    const captchaImageSrc = await page.$eval('iframe[src*="google.com/recaptcha"]', (iframe: HTMLIFrameElement) => {
      return iframe.src;
    });

    const captchaId = await this.requestCaptchaSolution(captchaImageSrc);
    const solution = await this.retrieveCaptchaSolution(captchaId);
    
    return solution;
  }

  async requestCaptchaSolution(captchaImageSrc: string): Promise<string> {
    let retryCount = 0;
    let captchaId = null;
  
    while (retryCount < 3 && !captchaId) {
      try {
        const response = await axios.post('http://2captcha.com/in.php', null, {
          params: {
            key: process.env.TWOCAPTCHA_API_KEY,
            method: 'userrecaptcha',
            googlekey: process.env.GOOGLE_API_KEY,
            pageurl: 'https://onlyfans.com',
            json: 1,
          },
        });
        if (response.data.status === 1) {
          captchaId = response.data.request;
        } else {
          throw new Error('Échec de la demande de solution CAPTCHA');
        }
      } catch (error) {
        retryCount++;
        console.log(`Échec de la demande de CAPTCHA, tentative ${retryCount}...`);
        await this.sleep(5000);
      }
    }
  
    if (!captchaId) {
      throw new Error('Impossible de résoudre le CAPTCHA après plusieurs tentatives');
    }
  
    return captchaId;
  }
  

  async retrieveCaptchaSolution(captchaId: string): Promise<string> {
    let solution: string | null = null;

    while (!solution) {
      const response = await axios.get(`http://2captcha.com/res.php?key=${process.env.TWOCAPTCHA_API_KEY}&action=get&id=${captchaId}&json=1`);
      if (response.data.status === 1) {
        solution = response.data.request;
      } else {
        console.log('En attente de la solution du CAPTCHA...');
        await this.sleep(5000); 
      }
    }

    return solution;
  }

  async handle2FA(page: puppeteer.Page) {
    const twoFACode = await this.getTwoFACode();
    
    await page.type('input[name="verification_code"]', twoFACode);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
  }

  async getTwoFACode(): Promise<string> {
    const client = new Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    const messages = await client.messages.list({ to: process.env.TWILIO_PHONE_NUMBER, limit: 1 });
    const message = messages[0].body;

    const match = message.match(/\d{6}/);
    if (match) {
      return match[0];
    } else {
      throw new Error('Code 2FA introuvable');
    }
  }

  async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getMessages() {
    const page = await this.loginToOnlyFans();
    try {
      await page.goto('https://onlyfans.com/my/messages', { waitUntil: 'networkidle2', timeout: 240000 });
  
      const messages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.message-text'))
          .map(el => {
            const text = el.textContent;
            return text ? text.trim() : ''; 
          })
          .filter(text => text.length > 0);
      });
  
      return messages;
    } catch (error) {
      console.error('Erreur lors de la récupération des messages:', error);
      return "This is empty";
    }
  }

  async close() {
    await this.browser.close();
  }
}
