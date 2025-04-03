import { Injectable } from '@nestjs/common';
import puppeteer from 'puppeteer-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');  
import * as dotenv from 'dotenv';
import { config } from 'src/config';
import axios from 'axios';
import { Twilio } from 'twilio';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

const stealth = StealthPlugin();
puppeteer.use(stealth);  

@Injectable()
export class ScraperService {
  private browser;  

  async init() {
    // console.log(__dirname)
    const busterPath = path.join(__dirname, 'buster');
    console.log(busterPath);
    this.browser = await puppeteer.launch({
      headless: false,
      // executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',  // Change le chemin si nécessaire
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        `--load-extension=${busterPath}`  // Si tu utilises une extension
      ],
      defaultViewport: null,
      timeout: 960000
    });
  }

  async loginToOnlyFans() {
    const page = await this.browser.newPage();
    // Fake user-agent et headers
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
    );

    // Fake headers
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'accept-encoding': 'gzip, deflate, br',
    });

    //Désactiver WebDriver
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    await page.evaluateOnNewDocument(() => {
      // Masquer les propriétés spécifiques à Puppeteer
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3],
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
    // Désactiver les fonctionnalités de Puppeteer qui trahissent l'automatisation
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
    });
    
    // await new Promise(resolve => setTimeout(resolve, 5000));

    try {
      await page.goto('https://onlyfans.com/', { waitUntil: 'domcontentloaded', timeout: 240000 });

      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('Page chargée');

      console.log('Connexion en cours...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      await page.mouse.move(100, 100);
      await page.mouse.down();
      await page.mouse.up();
  
      await page.setViewport({
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
      });
      await page.type('input[name="email"]', config.ONLYFANS_LOGIN);
      await page.mouse.move(120, 110);

      await page.type('input[name="password"]', config.ONLYFANS_PASSWORD);
      await page.mouse.move(130, 90);

      await page.click('button[type="submit"]');
      
      // Attendre un court instant pour laisser le captcha potentiellement s'afficher
      await new Promise(resolve => setTimeout(resolve, 10000));

    // Rechercher tous les iframes et récupérer leurs sources
    const iframes = await page.$$eval('iframe', iframes =>
      iframes.map(iframe => iframe.src),
    );
    // console.log(iframes);

    let capKey = '';

    // Fonction pour extraire la clé 'k' d'une URL
    const extractCaptchaKey = (urls: string[]): string | null => {
      const regex = /[?&]k=([a-zA-Z0-9_-]+)/;
      const match = urls[0]?.match(regex);
      return match ? match[1] : null;
    };

    // Vérifier la présence de la clé de reCAPTCHA visible et invisible à partir des sources d'iframe
    let recaptchaVisibleDetected = false;
    const captchaKey = extractCaptchaKey(iframes);

    if (captchaKey) {
      // console.log('reCAPTCHA détecté, clé :', captchaKey);
      recaptchaVisibleDetected = true;
      capKey = captchaKey;
    }

    // Recherche de l'iframe contenant le reCAPTCHA
    const recaptchaFrame = await page
      .frames()
      .find(frame => frame.url().includes(capKey));

    if (recaptchaFrame) {
      console.log('reCAPTCHA iframe trouvé !');

      // Sélectionner et cliquer sur la case à cocher
      const checkbox = await recaptchaFrame.$('.recaptcha-checkbox');
      if (checkbox) {
      await page.mouse.move(102, 103);

        await checkbox.click();
        console.log('CAPTCHA coché avec succès !');
      } else {
        console.log('Case à cocher non trouvée');
      }
    }

    const isLoggedIn = await page.evaluate(() => {
      return !!document.querySelector('.g-text-ellipsis');
    });

    if (isLoggedIn) {
      console.log('Connexion réussie');
    } else {
      console.log('Connexion échouée');
    }

    } catch (error) {
      console.error('Erreur lors de la navigation ou de la connexion:', error);
      throw error;
    }
    return page;
  }
  
  // const twoFactorPage = await page.$('input[name="verification_code"]');
  // if (twoFactorPage) {
  //   console.log('2FA détecté, récupération du code...');
  //   await this.handle2FA(page);
  // }

    // Fonction pour télécharger l'image du CAPTCHA
    async downloadImage(url: string, path: string) {
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer()); // ✅ Correction ici
      fs.writeFileSync(path, buffer);
      console.log('✅ Image CAPTCHA téléchargée:', path);
    }


  // Fonction pour simuler une pause
  private async sleep(ms: number): Promise<void> {
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
