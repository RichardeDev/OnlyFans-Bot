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
        const captcha = await page.$('iframe[src*="google.com/recaptcha"]');
        if (captcha) {
          console.log('Captcha détecté, besoin de le résoudre...');
          await this.handleCaptcha(page);
        }
      } else {
        console.log('Utilisateur déjà connecté');
      }
    } catch (error) {
      console.error('Erreur lors de la navigation ou de la connexion:', error);
      throw error;
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
    const url = 'https://onlyfans.com/api2/v2/chats';
    const params = {
      limit: 10,
      offset: 0,
      skip_users: 'all',
      order: 'recent'
    };

    const headers = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'fr,fr-FR;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
      'app-token': '33d57ade8c02dbc5a333db99ff9ae26a',
      'priority': 'u=1, i',
      'referer': 'https://onlyfans.com/my/chats/',
      'sec-ch-ua': '"Chromium";v="134", "Not:A-Brand";v="24", "Microsoft Edge";v="134"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'sign': '38772:91cf31c497318493dc2fc19bc24de875283b73f1:7a5:67dd85ab',
      'time': '1742895332973',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
      'user-id': '485019792',
      'x-bc': 'ff00b1c8a927081e73028fb72289e84535d33857',
      'x-hash': 'Z8+ffULHwcx/lG65TtWH/lDPiiOjaYHhdIoMjsw=',
      'x-of-rev': '202503211528-8728c0cb7a'
    };
    
    const cookies = 'fp=ff00b1c8a927081e73028fb72289e84535d33857; csrf=y3CfHMdv9a5be2562a0d9c643c51ffba618c01d9; lang=fr; auth_id=485019792; st=56fc1d19f1f2aa26b76a8d30a0905ed1535cc9c2a026010dba3fd226afc3a5b1; sess=f2p3asl17hqegs1okg9j53jrn8; __cf_bm=gv0igV64RycbIN2sSTK15ltvouuQQz7P294o_IrmcfQ-1742891118-1.0.1.1-UlSkXGxxjaQCoYN8XdPAmbwhJ3uGBQT0VVD0TDzuNzq.NZEmYNgKWE12JzI5eFyIIaRhu4SRDvD3ApWSsetZfRa6Z03hOThUgo5aE4dwxUs; _cfuvid=56bsP.jt4KfhaxtakotdTUUf.muK0fXxN4DeYKPxRwI-1742816467478-0.0.1.1-604800000';
    
    headers['cookie'] = cookies;
    

    try {
      const response = await axios.get(url, { params, headers });

      const unreadMessages = response.data.list.filter(chat => chat.lastMessage.isNew && chat.canSendMessage);
      return unreadMessages;

    } catch (error) {
      console.error('Error fetching chats:', error.response?.data || error.message);
      throw error;
    }
  }

  async close() {
    await this.browser.close();
  }
}
