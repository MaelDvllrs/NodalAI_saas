/**
 * browser.js — Pilote Chromium vers chatgpt.com pour obtenir de vraies réponses
 * avec web search activé (sources réelles, URLs vérifiables).
 *
 * Prérequis :
 *   CHATGPT_COOKIES dans .env — cookies JSON exportés depuis chatgpt.com
 *   (via l'extension "Cookie-Editor" → bouton Export → format JSON)
 *
 * Optionnel :
 *   CHROMIUM_PATH — chemin vers un Chromium/Chrome existant (sinon Puppeteer
 *   utilise celui qu'il a téléchargé lors de npm install)
 */

import puppeteer from 'puppeteer';

const CHATGPT_URL = 'https://chatgpt.com/';
const RESPONSE_TIMEOUT_MS = 180_000; // 3 min max par variante

// ── Sélecteurs DOM (stables sur chatgpt.com à partir de mai 2024) ────────────
const SEL_INPUT       = '#prompt-textarea';
const SEL_SEND        = 'button[data-testid="send-button"]:not([disabled])';
const SEL_STOP        = 'button[data-testid="stop-button"]';
const SEL_ANSWER      = '[data-message-author-role="assistant"]';
const SEL_SOURCES_BTN = 'button[aria-label="Sources"]';

// ── Lancement du navigateur ───────────────────────────────────────────────────

async function launchWithSession() {
  const cookiesEnv = process.env.CHATGPT_COOKIES;
  if (!cookiesEnv) {
    throw new Error(
      'CHATGPT_COOKIES manquant dans .env\n' +
      'Exportez vos cookies chatgpt.com via l\'extension "Cookie-Editor" (Export → JSON),\n' +
      'puis ajoutez dans .env :\n' +
      'CHATGPT_COOKIES=\'[{"name":"__Secure-next-auth.session-token","value":"…","domain":".chatgpt.com","path":"/","httpOnly":true,"secure":true}]\''
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const page = await browser.newPage();

  // Masquer les traces de Puppeteer
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // Charger les cookies de session
  const cookies = JSON.parse(cookiesEnv);
  await page.setCookie(...cookies);

  return { browser, page };
}

// ── Envoi d'un prompt et extraction de la réponse ────────────────────────────

async function sendPrompt(page, prompt) {
  // Nouveau chat à chaque variante (contexte propre)
  await page.goto(CHATGPT_URL, { waitUntil: 'networkidle2', timeout: 60_000 });

  // Vérifier que la session est valide
  const currentUrl = page.url();
  if (currentUrl.includes('auth0') || currentUrl.includes('/auth/') || currentUrl.includes('/login')) {
    throw new Error(
      'Session ChatGPT expirée — mettez à jour CHATGPT_COOKIES dans .env\n' +
      '(Exportez à nouveau les cookies depuis chatgpt.com après vous être reconnecté)'
    );
  }

  // Attendre l'input
  await page.waitForSelector(SEL_INPUT, { timeout: 30_000 });
  await new Promise(r => setTimeout(r, 600));

  // Insérer le texte via execCommand (fiable sur les contenteditable)
  await page.click(SEL_INPUT);
  await page.evaluate((text) => {
    const el = document.querySelector('#prompt-textarea');
    if (!el) throw new Error('Input ChatGPT introuvable (#prompt-textarea)');
    el.focus();
    document.execCommand('selectAll');
    document.execCommand('insertText', false, text);
  }, prompt);

  await new Promise(r => setTimeout(r, 400));

  // Envoyer
  await page.waitForSelector(SEL_SEND, { timeout: 10_000 });
  await page.click(SEL_SEND);

  // Attendre que la réponse commence (bouton Stop apparaît)
  await page.waitForSelector(SEL_STOP, { timeout: 30_000 }).catch(() => {
    // Réponse trop rapide — le bouton Stop a déjà disparu
  });

  // Attendre que le streaming soit terminé (bouton Stop disparaît)
  await page.waitForFunction(
    (sel) => !document.querySelector(sel),
    { timeout: RESPONSE_TIMEOUT_MS, polling: 1000 },
    SEL_STOP
  );

  // Laisser le DOM se stabiliser
  await new Promise(r => setTimeout(r, 1200));

  // ── Extraire texte + HTML du dernier message assistant ───────────────────
  const { text, html } = await page.evaluate((answerSel) => {
    const messages = [...document.querySelectorAll(answerSel)];
    const last = messages[messages.length - 1];
    if (!last) return { text: '', html: '' };
    return { text: last.innerText || last.textContent || '', html: last.innerHTML || '' };
  }, SEL_ANSWER);

  // ── 1. Citations inline dans la réponse ──────────────────────────────────
  const inlineSources = await page.evaluate((answerSel) => {
    function cleanUrl(raw) {
      try {
        const u = new URL(raw);
        u.searchParams.delete('utm_source');
        u.searchParams.delete('utm_medium');
        u.searchParams.delete('utm_campaign');
        return u.toString();
      } catch { return raw; }
    }
    function isExternal(url) {
      if (!url || url.startsWith('#') || url.startsWith('javascript:')) return false;
      try { new URL(url); } catch { return false; }
      if (url.includes('chatgpt.com') || url.includes('openai.com')) return false;
      return true;
    }
    const seen = new Set();
    const results = [];
    const messages = [...document.querySelectorAll(answerSel)];
    const last = messages[messages.length - 1];
    if (!last) return results;
    for (const a of last.querySelectorAll('[data-testid="webpage-citation-pill"] a, a[href]')) {
      const raw = a.href;
      if (!isExternal(raw)) continue;
      const url = cleanUrl(raw);
      if (seen.has(url)) continue;
      seen.add(url);
      results.push({ url, name: a.textContent?.trim() || url, type: 'web', frequency: 1 });
    }
    return results;
  }, SEL_ANSWER);

  // ── 2. Ouvrir le panel Sources et extraire toutes les entrées ─────────────
  const panelSources = [];
  let sourcesHtml = '';
  const sourcesBtn = await page.$(SEL_SOURCES_BTN);
  if (sourcesBtn) {
    await sourcesBtn.click();
    // Attendre l'apparition du panel (data-testid="screen-threadFlyOut")
    await page.waitForSelector('[data-testid="screen-threadFlyOut"]', { timeout: 8_000 })
      .catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    // Scroller le panel jusqu'en bas pour charger toutes les sources
    await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="screen-threadFlyOut"]');
      if (panel) panel.scrollTop = panel.scrollHeight;
    });
    await new Promise(r => setTimeout(r, 400));

    // Extraire les sources + HTML depuis les <ul><li><a> du panel
    const { rawPanelSources, panelHtml } = await page.evaluate(() => {
      function cleanUrl(raw) {
        try {
          const u = new URL(raw);
          u.searchParams.delete('utm_source');
          u.searchParams.delete('utm_medium');
          u.searchParams.delete('utm_campaign');
          return u.toString();
        } catch { return raw; }
      }
      const panel = document.querySelector('[data-testid="screen-threadFlyOut"]');
      if (!panel) return { rawPanelSources: [], panelHtml: '' };
      const results = [];
      for (const a of panel.querySelectorAll('ul li a[href]')) {
        const raw = a.href;
        if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) continue;
        if (raw.includes('chatgpt.com') || raw.includes('openai.com')) continue;
        const url = cleanUrl(raw);
        const titleEl  = a.querySelector('.font-semibold, [class*="font-semibold"]');
        const domainEl = a.querySelector('div:first-child');
        const name = titleEl?.textContent?.trim() || domainEl?.textContent?.trim() || url;
        results.push({ url, name, type: 'web', frequency: 1 });
      }
      return { rawPanelSources: results, panelHtml: panel.innerHTML };
    });
    panelSources.push(...rawPanelSources);
    sourcesHtml = panelHtml;
  }

  // ── 3. Fusionner : inline d'abord, puis panel (sans doublons) ─────────────
  const seen = new Set(inlineSources.map(s => s.url));
  const sources = [...inlineSources];
  for (const s of panelSources) {
    if (!seen.has(s.url)) {
      seen.add(s.url);
      sources.push(s);
    } else {
      // Déjà présent inline → augmenter la fréquence
      const existing = sources.find(x => x.url === s.url);
      if (existing) existing.frequency += 1;
    }
  }

  return { text, html, sources, sourcesHtml };
}

// ── Point d'entrée public ─────────────────────────────────────────────────────

/**
 * Ouvre Chromium, envoie chaque prompt vers chatgpt.com, retourne les résultats.
 *
 * @param {string[]} prompts
 * @param {{ emitEvent?: Function, jobId?: string }} opts
 * @returns {Promise<Array<{ text: string, sources: Array<{ name, url, type, frequency }> }>>}
 */
export async function askChatGptBrowser(prompts, { emitEvent, jobId } = {}) {
  emitEvent?.(jobId, { type: 'step', message: `🌐 Lancement de Chromium → chatgpt.com...` });

  const { browser, page } = await launchWithSession();

  try {
    const results = [];

    for (let i = 0; i < prompts.length; i++) {
      emitEvent?.(jobId, {
        type: 'step',
        message: `📨 Variante ${i + 1}/${prompts.length} — envoi à ChatGPT (web search)...`,
      });

      const result = await sendPrompt(page, prompts[i]);
      results.push(result);

      emitEvent?.(jobId, {
        type: 'step',
        message: `  ✅ Réponse reçue — ${result.text.split(/\s+/).length} mots · ${result.sources.length} source(s) web extraite(s)`,
      });

      if (result.sources.length) {
        result.sources.forEach(s => {
          emitEvent?.(jobId, { type: 'step', message: `    📌 ${s.name} — ${s.url}` });
        });
      }
    }

    return results;
  } finally {
    await browser.close();
    emitEvent?.(jobId, { type: 'step', message: `🔒 Navigateur fermé` });
  }
}
