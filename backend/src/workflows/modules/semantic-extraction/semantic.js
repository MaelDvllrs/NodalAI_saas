/**
 * semantic.service.js
 *
 * Analyse sémantique approfondie d'un mot-clé :
 *   1. Récupère le contenu texte des pages top SERP (fetch + strip HTML)
 *   2. Calcule le TF-IDF sur le corpus, pondéré par rang
 *   3. Enrichit via DataForSEO keywords_for_keywords
 *   4. Synthèse structurée via Claude Haiku
 *
 * Export principal : analyzeSemanticKeywords(keyword, serpResults)
 */

import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { claudeCreateWithSearch, extractTextContent } from '../../../utils/claudeRetry.js';

const BASE_URL   = 'https://api.dataforseo.com/v3';
const MAX_PAGES        = 8;    // Nombre de pages à intégrer dans l'analyse TF-IDF
const FETCH_TIMEOUT_MS = 7000; // Timeout par page (ms)
const MAX_TEXT_CHARS   = 6000; // Longueur max de texte conservée par page
const MAX_SERP_SCAN    = 20;   // Positions SERP max scannées pour la classification
const MIN_HOMOGENEOUS  = 5;    // Seuil minimum de pages homogènes (sinon fallback top 20)

// ─────────────────────────────────────────────────────────────────────────────
// Auth DataForSEO
// ─────────────────────────────────────────────────────────────────────────────

function getAuthHeader() {
  const login    = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error('DataForSEO : identifiants manquants dans .env');
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stop words français
// ─────────────────────────────────────────────────────────────────────────────

const FR_STOP_WORDS = new Set([
  // Articles & déterminants
  'le','la','les','un','une','des','du','de','da','au','aux','l','d',
  'ce','cet','cette','ces','mon','ma','mes','ton','ta','tes','son','sa','ses',
  'notre','votre','nos','vos','leur','leurs',
  // Pronoms
  'il','elle','ils','elles','nous','vous','on','je','tu',
  'me','te','se','lui','y','en','le','la','les',
  'qui','que','quoi','dont','où','lequel','laquelle','lesquels','lesquelles',
  'duquel','auquel','auxquels','auxquelles',
  'cela','ceci','celui','celle','ceux','celles','ça',
  'moi','toi','soi','eux',
  // Conjonctions & connecteurs
  'et','ou','ni','mais','donc','or','car','si','que','quand','comme','lorsque',
  'quoique','bien','quand','puisque','afin','ainsi','alors','ensuite','enfin',
  'pendant','après','avant','depuis','jusque','jusqu','selon','entre','malgré',
  'sauf','parce','même','aussi','non','oui','soit',
  // Prépositions
  'de','du','des','à','au','aux','en','dans','par','pour','sur','sous','vers',
  'avec','sans','via','chez','contre','entre','dès','lors','lors','selon',
  'environ','près','loin',
  // Adverbes génériques
  'pas','plus','moins','très','trop','assez','peu','beaucoup','tellement',
  'tant','autant','jamais','parfois','souvent','toujours','déjà','encore',
  'bientôt','maintenant','hier','demain','ici','là','partout','ailleurs',
  'bien','mal','vite','tôt','tard','hier','après','avant','dessus','dessous',
  'dedans','dehors','ensemble','seul','seule','seuls','seules',
  // Verbes auxiliaires & très génériques (conjugués)
  'est','sont','était','étaient','sera','serait','seront','seraient','sois','soit',
  'ai','as','a','avons','avez','ont','avait','avaient','aura','aurait','auront',
  'eu','été','avoir','être',
  'peut','peuvent','pouvait','pourrait','pourrez','puisse',
  'doit','doivent','devait','devrait',
  'faut','fallait','faudrait',
  'fait','font','faisait','fera','ferait',
  'dit','disent','disait',
  'va','vont','allait','aller',
  'vient','viennent','venait','venir',
  'prend','prennent','prenait','prendre',
  'met','mettent','mettait','mettre',
  'donne','donnent','donnait',
  'trouve','trouvent','trouvait',
  'voir','savoir','vouloir','pouvoir','devoir',
  // Nombres écrits
  'un','deux','trois','quatre','cinq','six','sept','huit','neuf','dix',
  'onze','douze','vingt','cent','mille','premier','première','second','deuxième',
  // Jours & mois
  'lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche',
  'janvier','février','mars','avril','mai','juin','juillet','août',
  'septembre','octobre','novembre','décembre',
  // Web / UI génériques
  'http','https','www','com','org','fr','net','html','php',
  'page','pages','site','sites','menu','nav','footer','header',
  'article','articles','lire','voir','aller','cliquer','clic',
  'copyright','droits','reserves','accueil','retour','suite',
  // Mots trop génériques
  'tout','tous','toute','toutes','autre','autres','même','plusieurs',
  'certain','certaine','certains','certaines','chaque','quelque','quelques',
  'tel','telle','tels','telles','quel','quelle','quels','quelles',
  'type','types','façon','manière','cas','fois','point','points',
  'partie','parties','niveau','niveaux','aspect','aspects',
  // Termes techniques DOM / JS
  'first','child','parent','next','prev','node','element','event',
  'function','return','class','object','true','false','null','undefined',
  'var','let','const','new','this','window','document','body','inner',
  'outer','append','remove','query','select','target','value','input',
  'index','array','string','number','boolean','length','push','pop',
  'map','filter','reduce','forEach','then','catch','async','await',
  'props','state','render','mount','hook','ref','use','get','set',
  // Entités HTML (codes qui passent la tokenisation)
  'amp','nbsp','quot','apos','x27','x2f','x3d','x26','x3c','x3e',
  'shy','reg','copy','trade','ldquo','rdquo','laquo','raquo',
  // Noms de domaine et réseaux sociaux
  'reddit','quora','pinterest','facebook','twitter','instagram',
  'youtube','google','wikipedia','amazon','linkedin','tiktok',
  'snapchat','discord','whatsapp','telegram','wordpress','shopify',
  // Garbage technique web
  'button','span','div','aria','onclick','svg','path','src','alt',
  'data','json','url','uuid','hash','token','cookie','cache',
  'error','debug','console','log','info','warn','img','icon',
  'flex','grid','block','inline','margin','padding','color','full',
  // CSS propriétés & valeurs — empêche "overflow hidden", "rounded inherit", etc.
  'overflow','hidden','visible','scroll','clip','resize',
  'display','position','float','clear',
  'outline','background','opacity','transform','transition','animation',
  'width','height','align','justify','vertical','horizontal','wrap','nowrap',
  'font','weight','italic','underline','decoration','variant','indent',
  'absolute','relative','fixed','sticky','static',
  'rounded','normal','bold','initial','inherit','unset','revert',
  'auto','content',
  // Pseudo-classes / sélecteurs CSS
  'before','after','hover','active','focus','checked','disabled',
  'enabled','visited','root','empty','nth','odd','even','lang','dir',
  // Noms de composants UI génériques
  'container','wrapper','sidebar','dropdown','overlay','modal','popup',
  'carousel','slider','toggle','switch','badge','chip','pill','avatar',
  'toast','tooltip','popover','drawer','collapse',
  // Sous-classes utilitaires CSS (Tailwind/Bootstrap)
  'row','col','column','offset','order','primary','secondary',
  'success','danger','warning','muted','light','dark','accent','base',
  'gray','grey','white','black',
  // Unités CSS et couleurs
  'rem','vmin','vmax','deg','rad','rgb','rgba','hsl','hsla',
  // Noise temporel / unités courtes
  'ago','min','sec','hrs','ago','jan','feb','mar','apr','jun',
  'jul','aug','sep','oct','nov','dec',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Filtre anti-bruit spécifique aux n-grams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tokens qui polluent les n-grams : CSS values, classes utilitaires, attributs HTML.
 * Complète FR_STOP_WORDS pour les n-grams — les unigrams peuvent les conserver si pertinents.
 */
const NGRAM_NOISE_TOKENS = new Set([
  // Noms de propriétés CSS non couverts par FR_STOP_WORDS
  'border','shadow','radius','weight','family','size','spacing','letter',
  'style','variant','line','list','table','caption','cursor',
  'outline','clip','resize','opacity','transform','transition','filter',
  // Valeurs CSS génériques
  'solid','dashed','dotted','double','groove','ridge','inset','outset',
  'inherit','initial','unset','revert','none','auto','normal','bold',
  'italic','underline','uppercase','lowercase','capitalize','nowrap',
  'hidden','visible','scroll','absolute','relative','fixed','sticky','static',
  // Classes utilitaires (Tailwind / Bootstrap)
  'rounded','shadow','flex','grid','block','inline','col','row',
  'container','wrapper','offset','order','mx','my','px','py',
  'text','bg','gap','ring','prose','leading','tracking','truncate','overflow',
  // HTML / DOM attributs et tags
  'class','style','script','link','head','html','body','meta',
  'alt','src','rel','href','aria','role','data','span','div',
  'section','article','header','footer','aside','nav','main',
  // Tokens de couleur standalone
  'gray','grey','white','black','red','blue','green','yellow',
  'orange','pink','purple','indigo','teal','cyan','muted','light','dark',
  // JavaScript / garbage DOM
  'onclick','onchange','submit','reset','event','listener',
]);

const RE_HAS_DIGIT = /\d/;

/**
 * Vérifie qu'un n-gram est linguistiquement propre et non bruité.
 * Critères :
 *  - Aucun token ne contient de chiffre
 *  - Aucun token n'est dans NGRAM_NOISE_TOKENS
 *  - Le premier ET le dernier token ne sont PAS des stop-words
 *    ("un site" → rejeté car "un" en tête)
 *    ("création de site web" → conservé : "creation" et "web" sont des mots de contenu)
 *  - Stop-words au milieu autorisés — ils servent de mots de liaison naturels
 *  - Au moins 1 mot de contenu réel parmi tous les tokens
 * @param {string[]} normTokens - tokens normalisés (sans accents)
 * @returns {boolean}
 */
function isValidNgram(normTokens) {
  for (const tok of normTokens) {
    if (RE_HAS_DIGIT.test(tok))      return false;  // chiffre → bruit technique
    if (NGRAM_NOISE_TOKENS.has(tok)) return false;  // token CSS/UI
  }
  // Premier et dernier tokens ne doivent PAS être des stop-words
  // → évite "un site", "pour vous", "le meilleur"
  const first = normTokens[0];
  const last  = normTokens[normTokens.length - 1];
  if (FR_STOP_WORDS.has(first) || FR_STOP_WORDS.has(last)) return false;
  // Au moins 1 mot de contenu (non-stop, non-noise)
  return normTokens.some((t) => !FR_STOP_WORDS.has(t) && !NGRAM_NOISE_TOKENS.has(t));
}

// ─────────────────────────────────────────────────────────────────────────────
// Décodeur d'entités HTML — préserve les accents français
// ─────────────────────────────────────────────────────────────────────────────

// Table des entités HTML nommées → caractères réels
// Couverture : accents français complets + ponctuation courante
const HTML_ENTITIES = {
  // Voyelles accentuées — minuscules
  'eacute': 'é', 'egrave': 'è', 'ecirc': 'ê', 'euml': 'ë',
  'agrave': 'à', 'aacute': 'á', 'acirc': 'â', 'auml': 'ä', 'aring': 'å',
  'igrave': 'ì', 'iacute': 'í', 'icirc': 'î', 'iuml': 'ï',
  'ograve': 'ò', 'oacute': 'ó', 'ocirc': 'ô', 'ouml': 'ö',
  'ugrave': 'ù', 'uacute': 'ú', 'ucirc': 'û', 'uuml': 'ü',
  'ccedil': 'ç', 'ntilde': 'ñ', 'aelig': 'æ', 'oelig': 'œ', 'szlig': 'ß', 'yuml': 'ÿ',
  // Voyelles accentuées — majuscules
  'Eacute': 'É', 'Egrave': 'È', 'Ecirc': 'Ê', 'Euml': 'Ë',
  'Agrave': 'À', 'Aacute': 'Á', 'Acirc': 'Â', 'Auml': 'Ä',
  'Igrave': 'Ì', 'Iacute': 'Í', 'Icirc': 'Î', 'Iuml': 'Ï',
  'Ograve': 'Ò', 'Oacute': 'Ó', 'Ocirc': 'Ô', 'Ouml': 'Ö',
  'Ugrave': 'Ù', 'Uacute': 'Ú', 'Ucirc': 'Û', 'Uuml': 'Ü',
  'Ccedil': 'Ç', 'Ntilde': 'Ñ', 'AElig': 'Æ', 'OElig': 'Œ', 'Yacute': 'Ý',
  // Ponctuation & symboles communs (ne pas effacer)
  'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'",
  'nbsp': ' ', 'shy': '', 'reg': '®', 'copy': '©', 'trade': '™',
  'laquo': '«', 'raquo': '»', 'ldquo': '\u201c', 'rdquo': '\u201d',
  'lsquo': '\u2018', 'rsquo': '\u2019', 'mdash': '\u2014', 'ndash': '\u2013', 'hellip': '\u2026',
  'euro': '\u20ac', 'pound': '\u00a3', 'yen': '\u00a5',
};

/**
 * Décode TOUTES les entités HTML en caractères réels.
 * Contrairement au code précédent, `&eacute;` devient `é` (pas un espace).
 * @param {string} str - HTML partiel ou texte avec entités
 * @returns {string}    - Texte décodé avec accents préservés
 */
function decodeHtmlEntities(str) {
  return str
    // Entités nommées : &eacute; → é (case-sensitive pour majuscules)
    .replace(/&([a-zA-Z]{2,8});/g, (full, name) => {
      const decoded = HTML_ENTITIES[name];
      return decoded !== undefined ? decoded : full; // laisse intact si inconnu
    })
    // Entités hex : &#xE9; ou &#xe9; → é
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ' '; }
    })
    // Entités décimales : &#233; → é
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return ' '; }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML → texte brut
// ─────────────────────────────────────────────────────────────────────────────

function stripHtml(html) {
  // ── Étape 1 : Supprimer JSON-LD, commentaires et blocs non sémantiques ──────
  let cleaned = html
    .replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<figure[\s\S]*?<\/figure>/gi, ' ');

  // ── Étape 2 : Extraire uniquement les blocs sémantiques ───────────────────
  const blocks = [];
  const semanticREs = [
    /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    /<li[^>]*>([\s\S]*?)<\/li>/gi,
    /<td[^>]*>([\s\S]*?)<\/td>/gi,
  ];
  for (const re of semanticREs) {
    let m;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(cleaned)) !== null) blocks.push(m[1]);
  }

  // Fallback vers tout le HTML nettoyé si trop peu de blocs extraits
  const extracted = blocks.join(' ').replace(/<[^>]+>/g, ' ');
  const fallback  = cleaned.replace(/<[^>]+>/g, ' ');
  const source    = extracted.replace(/\s+/g, ' ').trim();
  const text      = source.length > 300 ? source : fallback.replace(/\s+/g, ' ').trim();

  // ── Étape 3 : Décoder toutes les entités HTML → caractères réels ───────
  const decoded = decodeHtmlEntities(text).replace(/\s+/g, ' ').trim();

  // ── Étape 4 : Supprimer les phrases / fragments contenant du bruit identifié ──
  // Pattern : séquences de mots signalant du contenu parasite (footer, UI, traductions…)
  const NOISE_PHRASE_RES = [
    /\bmerci\b[^.!?]*[.!?]?/gi,                           // phrases avec "merci"
    /afficher\s+original[^.!?]*/gi,                        // bouton de traduction
    /traductions?\s+actives?[^.!?]*/gi,                    // widget traduction
    /salty\s+yak[^.!?]*/gi,                               // artefact SaaS spécifique
    /yak\s*\d[^.!?]*/gi,                                  // IDs dynamiques type yak4831
    /\bsaas\s+salty[^.!?]*/gi,                            // variante
    /[a-z0-9]{8,}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{12}/gi, // UUIDs
    /\b[0-9a-f]{8,40}\b/gi,                              // hashes hex longs (IDs)
  ];
  let filtered = decoded;
  for (const re of NOISE_PHRASE_RES) filtered = filtered.replace(re, ' ');
  filtered = filtered.replace(/\s{2,}/g, ' ').trim();

  // Compter les mots avant troncature (mesure réelle pour la mise à l'échelle de la densité)
  const fullWordCount = filtered ? filtered.trim().split(/\s+/).filter(Boolean).length : 0;

  // Couper à la limite de caractères sur une frontière de mot (ne coupe jamais un mot)
  if (filtered.length > MAX_TEXT_CHARS) {
    const cutAt = filtered.lastIndexOf(' ', MAX_TEXT_CHARS);
    return { text: filtered.substring(0, cutAt > 0 ? cutAt : MAX_TEXT_CHARS), fullWordCount };
  }
  return { text: filtered, fullWordCount };
}

// Fetch une page avec gestion de l'encodage (UTF-8, ISO-8859-1, Windows-1252)
// ─────────────────────────────────────────────────────────────────────────────
// Problème du fetch natif : response.text() ignore les déclarations charset
// dans les balises <meta> et décode systématiquement en UTF-8, ce qui coupe
// les accents sur les sites servis en ISO-8859-1 ou Windows-1252 (fréquent
// sur des CMS anciens français).
// Solution : axios + responseType 'arraybuffer' + détection charset → TextDecoder

/**
 * Détecte le charset déclaré dans les headers HTTP ou les balises <meta>.
 * Retourne toujours un label accepté par TextDecoder.
 * @param {string} contentType  - Valeur du header Content-Type
 * @param {Buffer} bufferHead   - Premiers 2048 octets de la réponse (décodés latin1)
 */
function detectCharset(contentType, bufferHead) {
  // 1. Content-Type header : charset=utf-8 / charset=iso-8859-1
  const ctMatch = (contentType || '').match(/charset=([^\s;,"']+)/i);
  if (ctMatch) {
    const cs = ctMatch[1].toLowerCase().trim();
    // Mapper les alias vers des labels TextDecoder valides
    if (cs === 'utf-8' || cs === 'utf8')        return 'utf-8';
    if (cs === 'latin1' || cs === 'latin-1' ||
        cs === 'iso-8859-1' || cs === 'iso8859-1' ||
        cs === 'windows-1252' || cs === 'win1252') return 'windows-1252';
    return cs; // passe directement (TextDecoder émettra si invalide)
  }
  // 2. <meta charset="..."> ou <meta http-equiv="Content-Type" content="...;charset=...">
  const metaMatch =
    bufferHead.match(/<meta[^>]+charset=["']?([^"'\s;>/]+)/i) ||
    bufferHead.match(/charset=([^"'\s;>/]+)/i);
  if (metaMatch) {
    const cs = metaMatch[1].toLowerCase().trim();
    if (cs.startsWith('iso') || cs === 'latin1' || cs.startsWith('windows')) return 'windows-1252';
    if (cs === 'utf8') return 'utf-8';
    return cs;
  }
  return 'utf-8'; // défaut : UTF-8
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification du type de page SERP (URL + titre uniquement, sans fetch)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classifie le type d'une page SERP à partir de son URL et de son titre.
 * Opere uniquement sur les métadonnées SERP — pas de fetch nécessaire.
 *
 * @param {string} url
 * @param {string} title
 * @returns {'blog_article'|'product_page'|'category_page'|'forum'|'homepage'|'comparison_page'}
 */
function classifyPageType(url, title) {
  const u = (url   || '').toLowerCase();
  const t = (title || '').toLowerCase();

  // ── Forum / réseau social / wiki (toujours exclus) ───────────────────────
  const SOCIAL_FORUM_RE = /reddit\.com|quora\.com|twitter\.com|x\.com|facebook\.com|linkedin\.com|instagram\.com|tiktok\.com|pinterest\.com|youtube\.com|trustpilot\.com|tripadvisor\.|yelp\.com|avis-verifies\.com|wikipedia\.org|wikihow\.com|stackexchange\.com|stackoverflow\.com|forum\.|forums\.|\.forum/;
  if (SOCIAL_FORUM_RE.test(u)) return 'forum';
  if (/\/r\/|\/forum\/|\/topic\/|\/thread\/|\/discussion\/|\/questions?\/|\/community\/|\/t\//.test(u)) return 'forum';

  // ── Homepage — URL sans chemin après le domaine ──────────────────────────
  try {
    const parsed = new URL(url);
    // pathname vide, "/", ou uniquement un code langue comme "/fr" ou "/en"
    if (/^\/?([a-z]{2})?\/?$/.test(parsed.pathname)) return 'homepage';
  } catch {
    // URL sans protocole : tester via regex (ex: "example.com" ou "example.com/")
    if (/^[^/]*\/?$/.test((url || '').replace(/^https?:\/\//, '').split('?')[0])) return 'homepage';
  }

  // ── Page produit / pricing ────────────────────────────────────────────────
  if (/\bprix\b|tarif|abonnement|pricing|acheter|commander|devis|\boffre/.test(t)) return 'product_page';
  if (/\/pricing|\/tarifs?|\/prix|\/plans?|\/checkout|\/acheter|\/offres?/.test(u)) return 'product_page';

  // ── Page de comparatif ────────────────────────────────────────────────────
  if (/ vs | versus |comparatif|meilleur[s]? |top \d|alternative/.test(t)) return 'comparison_page';
  if (/\/(vs|versus|comparatif|meilleur|top-\d|alternatives?)/.test(u))    return 'comparison_page';

  // ── Page catégorie / listing ──────────────────────────────────────────────
  if (/\/categorie\/|\/category\/|\/tag\/|\/topics?\/|\/archives?\/?$/.test(u)) return 'category_page';
  if (/\/blog\/?$|\/articles?\/?$|\/actualites?\/?$/.test(u))                   return 'category_page';

  // ── Article de blog / guide ───────────────────────────────────────────────
  if (/comment |guide |cr[eé]er |qu.est-ce|pourquoi |tutoriel|\btuto\b|d[eé]finition|introduction/.test(t)) return 'blog_article';
  if (/\/blog\/|\/article\/|\/guide\/|\/tuto\/|\/actualite\/|\/news\//.test(u))                             return 'blog_article';

  // ── Défaut ────────────────────────────────────────────────────────────────
  return 'blog_article';
}

async function fetchPageContent(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',         // récupère les octets bruts, pas de décodage auto
      timeout: FETCH_TIMEOUT_MS,
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; WenobleBot/1.0; +https://wenoble.fr)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',     // pas de gzip pour simplifier
      },
      maxRedirects: 5,
      validateStatus: (s) => s < 400,
    });

    const buffer = Buffer.from(response.data);

    // Détecter charset depuis les 2048 premiers octets (lus en latin1, car ASCII-compatible
    // pour les balises <meta> même sur des pages ISO-8859-1 ou Windows-1252)
    const headChunk = buffer.slice(0, 2048).toString('latin1');
    const charset   = detectCharset(response.headers['content-type'] || '', headChunk);

    // Décoder le buffer complet avec le bon charset
    let html;
    try {
      html = new TextDecoder(charset, { fatal: false }).decode(buffer);
    } catch {
      // TextDecoder ne connaît pas ce charset (ex: charset invalide ou exotique) → UTF-8
      html = buffer.toString('utf8');
      console.warn(`[Semantic] Charset inconnu "${charset}" pour ${url}, fallback UTF-8`);
    }

    const { text, fullWordCount } = stripHtml(html);
    console.log(`[Semantic] Récupéré: ${url} (${text.length} chars, ${fullWordCount} mots, charset: ${charset})`);
    return text ? { text, fullWordCount } : null;
  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT'
      || err.message?.includes('timeout');
    if (isTimeout) {
      console.warn(`[Semantic] Timeout: ${url}`);
    } else {
      console.warn(`[Semantic] Erreur fetch ${url}: ${err.message}`);
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalisation / tokenisation / lemmatisation
// ─────────────────────────────────────────────────────────────────────────────

function normalizeToken(token) {
  return token
    .toLowerCase()
    .normalize('NFD')                    // décompose les caractères accentués
    .replace(/[\u0300-\u036f]/g, '')     // supprime les diacritiques
    .replace(/[^a-z0-9]/g, '');         // ne garde que alphanumérique
}

/**
 * Lemmatiseur français léger (rule-based, entrée déjà normalisée sans accents).
 * Réduit les pluriels, féminins et variantes morphologiques courantes
 * à leur forme canonique pour éviter les doublons dans l'index.
 *
 * Exemples :
 *  logiciels → logiciel   sociaux → social   reseaux → reseau
 *  hebergements → hebergement   createurs → createur
 *
 * @param {string} t - Token normalisé (minuscule, sans accents, alphanum seul)
 * @returns {string} - Forme canonique
 */
function lemmatizeToken(t) {
  if (t.length <= 4) return t; // tokens courts : pas de transformation (risque de sur-stemming)
  // -eaux → -eau  (reseaux → reseau)
  if (t.endsWith('eaux') && t.length > 6) return t.slice(0, -1);
  // -aux → -al   (sociaux → social, locaux → local)
  if (t.endsWith('aux') && t.length > 5) return t.slice(0, -3) + 'al';
  // -eurs → -eur  (createurs → createur, auteurs → auteur)
  if (t.endsWith('eurs') && t.length > 6) return t.slice(0, -1);
  // -ements → -ement  (hebergements → hebergement)
  if (t.endsWith('ements') && t.length > 8) return t.slice(0, -1);
  // Keep -ing unchanged (English loan words: hosting, marketing, tracking…)
  if (t.endsWith('ing')) return t;
  // Generic plural: strip trailing -s  (logiciels → logiciel, solutions → solution)
  if (t.endsWith('s') && t.length > 4) return t.slice(0, -1);
  return t;
}

// Regex pour détecter les tokens non-sémantiques
const RE_HEX_CODE      = /^[0-9a-f]{3,8}$/i;   // codes hex (couleurs, ids)
const RE_ALL_DIGITS    = /^\d+$/;
const RE_MIXED_NUMONLY = /^[a-z]?\d{3,}$/i;     // ex: x27, w3, h1 (déjà filtrés)
const RE_SHORT_CAPS    = /^[A-Z]{2,4}$/;         // acronymes techniques CSS, API…

function tokenize(text) {
  // ⚠ IMPORTANT : \W+ en JS est ASCII-only → \W match sur `é`, `è`, `ç`…
  // ce qui tronque les mots accentués ("éditeur" → ["", "diteur"]).
  // On split sur tout ce qui N'EST PAS une lettre (y compris accentuée) ou un chiffre.
  return text
    .split(/[^a-zA-Z\u00C0-\u00FF0-9]+/)   // sépare sur ponctuation, espaces, guillemets…
    .map((raw) => lemmatizeToken(normalizeToken(raw)))  // normalise puis lemmatise
    .filter((t) =>
      t.length >= 3 &&
      !FR_STOP_WORDS.has(t) &&
      !NGRAM_NOISE_TOKENS.has(t) &&          // élimine tokens CSS/UI à la source
      !RE_ALL_DIGITS.test(t) &&
      !RE_HEX_CODE.test(t) &&
      !RE_MIXED_NUMONLY.test(t)
    );
}

/**
 * Tokenisation "brute" pour la génération de n-grams UNIQUEMENT.
 * Conserve les mots de liaison (prépositions, articles, pronoms…) pour
 * permettre des expressions naturelles comme "création de site web"
 * ou "logiciels en ligne". Les bords et la cohérence sont validés par isValidNgram().
 * Ne doit pas être utilisée pour les unigrams TF-IDF.
 */
function rawTokenize(text) {
  return text
    .split(/[^a-zA-Z\u00C0-\u00FF0-9]+/)
    .map((raw) => lemmatizeToken(normalizeToken(raw)))
    .filter((t) =>
      t.length >= 2 &&
      !NGRAM_NOISE_TOKENS.has(t) &&   // retire quand même le bruit CSS/UI
      !RE_ALL_DIGITS.test(t) &&
      !RE_HEX_CODE.test(t) &&
      !RE_MIXED_NUMONLY.test(t)
    );
}

/**
 * Pour chaque terme normalisé, retrouve la forme originale la plus fréquente
 * dans les textes bruts (préserve les accents : référencement, crédit, etc.)
 *
 * @param {string[]} rawTexts          - Textes des pages bruts (non tokenisés)
 * @param {Set<string>} normalizedSet  - Ensemble des termes normalisés à chercher
 * @returns {Record<string, string>}   - normalized → forme originale la + fréquente
 */
function buildOriginalForms(rawTexts, normalizedSet) {
  const counts = {}; // normalized → { original_form → count }
  for (const text of rawTexts) {
    if (!text) continue;
    // Split sur whitespace et ponctuation, préserve les lettres accentuées
    const words = text.split(/[\s\u00A0\u200B,;:.!?()\[\]{}<>"'`~@#$%^&*+=|\\/_]+/).filter(Boolean);
    for (const word of words) {
      // Nettoie légèrement (tirets, apostrophes) mais conserve les accents
      const clean = word.toLowerCase().replace(/[^a-zA-ZÀ-ÿ0-9]/g, '');
      if (clean.length < 3) continue;
      // Appliquer la même normalisation+lemmatisation que tokenize() pour cohérence
      const norm = lemmatizeToken(normalizeToken(clean));
      if (normalizedSet.has(norm)) {
        if (!counts[norm]) counts[norm] = {};
        counts[norm][clean] = (counts[norm][clean] || 0) + 1;
      }
    }
  }
  // Retourne la forme originale la plus fréquente pour chaque terme normalisé (unigrams)
  const result = {};
  for (const [norm, forms] of Object.entries(counts)) {
    const best = Object.entries(forms).sort((a, b) => b[1] - a[1])[0];
    result[norm] = best ? best[0] : norm;
  }

  // ── N-grams : reconstruire la forme accentuée depuis les formes unigram ──────
  // Ex: "hebergement web" → result["hebergement"]="hébergement" + "web" → "hébergement web"
  for (const norm of normalizedSet) {
    if (result[norm]) continue; // déjà résolu (unigram)
    if (norm.includes(' ')) {
      result[norm] = norm.split(' ').map((p) => result[p] || p).join(' ');
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consolidation sémantique des termes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fusionne les variantes morphologiques d'un même concept.
 *
 * Deux termes sont considérés équivalents si leurs tokens, una fois
 * lemmatisés et triés alphabétiquement, donnent la même clé.
 *
 * Exemples fusionnés :
 *  "logiciel creation web" + "logiciels creation web" → clé "creation logiciel web"
 *  "meilleur hebergement"  + "meilleurs hebergements" → clé "hebergement meilleur"
 *
 * On conserve la forme avec le score le plus élevé dans chaque groupe.
 *
 * @param {{ term: string, score: number, [k:string]: any }[]} terms
 * @returns {typeof terms}
 */
function consolidateTerms(terms) {
  const groups = new Map(); // lemmaKey → best term entry

  for (const t of terms) {
    // Clé : tokens lemmatisés + triés (ignore l'ordre et les pluriels)
    const lemmaKey = t.term.split(' ').map(lemmatizeToken).sort().join(' ');
    const existing = groups.get(lemmaKey);
    if (!existing || t.score > existing.score) {
      groups.set(lemmaKey, t);
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.score - a.score);
}

/**
 * Supprime les trigrammes redondants dont un bigramme sous-phrase score mieux.
 *
 * Logique : si "outil creation" score S1 et "meilleur outil creation" score S2 < S1,
 * le trigramme n'ajoute rien — on le retire pour éviter le bruit.
 *
 * On supprime également les permutations quasi-identiques :
 *  "outil rapide" et "rapide outil" → conserver uniquement le meilleur scoré.
 *
 * @param {{ term: string, score: number, [k:string]: any }[]} terms
 * @returns {typeof terms}
 */
function pruneRedundantNgrams(terms) {
  const scoreMap = new Map(terms.map((t) => [t.term, t.score]));

  // Étape 1 : supprimer les trigrammes dont un bigram sous-phrase est plus fort
  const afterSub = terms.filter((t) => {
    const parts = t.term.split(' ');
    if (parts.length < 3) return true; // unigrams et bigrams toujours conservés
    for (let i = 0; i <= parts.length - 2; i++) {
      const sub = parts.slice(i, i + 2).join(' ');
      const subScore = scoreMap.get(sub);
      if (subScore !== undefined && subScore >= t.score) return false;
    }
    return true;
  });

  // Étape 2 : dédupliquer les permutations ("outil rapide" vs "rapide outil")
  //   Pour chaque terme, la clé de permutation = tokens triés alphabétiquement.
  //   On garde uniquement le meilleur score dans chaque groupe de permutations.
  const permMap = new Map(); // sortedKey → best entry
  for (const t of afterSub) {
    const sortedKey = t.term.split(' ').sort().join(' ');
    const existing  = permMap.get(sortedKey);
    if (!existing || t.score > existing.score) permMap.set(sortedKey, t);
  }

  return Array.from(permMap.values()).sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────────────────────
// N-grams (bigrammes + trigrammes)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Génère tous les n-grams d'ordre n depuis un tableau de tokens normalisés.
 * @param {string[]} tokens - tokens normalisés (sans accents)
 * @param {number}   n      - ordre : 2 = bigrammes, 3 = trigrammes
 * @returns {string[]}      - n-grams space-joined ex: "plugin wordpress"
 */
function generateNgrams(tokens, n) {
  const ngrams = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    ngrams.push(tokens.slice(i, i + n).join(' '));
  }
  return ngrams;
}

/**
 * Enrichit chaque document tokenisé avec ses bigrammes, trigrammes et 4-grams.
 * Le TF-IDF recevra un vocabulaire élargi : unigrams + bigrams + trigrams + 4-grams.
 *
 * Deux listes de tokens sont utilisées :
 *  - cleanDocs  : sans stop-words → pour les unigrams
 *  - rawDocs    : avec stop-words → pour les fenêtres n-gram
 *    Cela permet de capturer "création de site web" (avec "de" au milieu)
 *    tout en gardant des unigrams propres.
 *
 * @param {string[][]} cleanDocs  - tokens sans stop-words (unigrams TF-IDF)
 * @param {string[][]} [rawDocs]  - tokens avec stop-words (fenêtres n-gram)
 * @returns {string[][]}
 */
function buildNgramDocs(cleanDocs, rawDocs) {
  return cleanDocs.map((clean, i) => {
    const win = (rawDocs && rawDocs[i]) ? rawDocs[i] : clean;
    return [
      ...clean,
      ...generateNgrams(win, 2).filter((ng) => isValidNgram(ng.split(' '))),
      ...generateNgrams(win, 3).filter((ng) => isValidNgram(ng.split(' '))),
      ...generateNgrams(win, 4).filter((ng) => isValidNgram(ng.split(' '))),
    ];
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TF-IDF pur JS (pondéré par rang)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string[][]} tokenizedDocs  - Documents déjà tokenisés (index = rang SERP)
 * @returns {{ term: string, score: number }[]}  - Triés par score desc
 */
function computeTfIdf(tokenizedDocs) {
  const N = tokenizedDocs.length;
  if (N === 0) return [];

  // TF par document
  const tfPerDoc = tokenizedDocs.map((tokens) => {
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const total = tokens.length || 1;
    return Object.fromEntries(Object.entries(freq).map(([k, v]) => [k, v / total]));
  });

  // DF : nombre de documents contenant chaque terme
  const df = {};
  for (const tf of tfPerDoc) {
    for (const term of Object.keys(tf)) {
      df[term] = (df[term] || 0) + 1;
    }
  }

  // ── Filtres DF ────────────────────────────────────────────────────────────
  // 1. Termes ubiquitaires : présents dans > 80 % des pages → pas discriminants
  const ubiquitousThreshold = N * 0.8;
  const ubiquitous = new Set(
    Object.entries(df)
      .filter(([, count]) => count > ubiquitousThreshold)
      .map(([t]) => t)
  );
  // 2. Termes isolés : une seule apparition sur corpus ≥ 4 pages
  //    On les conserve séparément — les meilleurs seront ajoutés en queue de liste
  const isolatedTerms = N >= 4
    ? new Set(Object.entries(df).filter(([, count]) => count === 1).map(([t]) => t))
    : new Set();

  // Agrégation TF-IDF pondérée par rang (rang 1 = poids max)
  const scores         = {}; // termes présents sur ≥ 2 pages  → { tfidf, count }
  const scoresIsolated = {}; // termes présents sur exactement 1 page

  // Comptage brut total des occurrences (toutes pages confondues)
  const rawCount = {};
  for (const tf of tfPerDoc) {
    for (const [term, termTf] of Object.entries(tf)) {
      // tf = freq/total → multiplier par total (length de la page) pour obtenir les occurrences
      // On additionne simplement le tf normalisé — la comparaison relative reste cohérente
      rawCount[term] = (rawCount[term] || 0) + termTf;
    }
  }

  tfPerDoc.forEach((tf, idx) => {
    // Rang SERP : idx=0 (1er) → poids 2.0, idx=7 (8e) → poids 1.125
    const rankWeight = 1.0 + (N - idx) / (N * 2);
    for (const [term, termTf] of Object.entries(tf)) {
      if (ubiquitous.has(term)) continue; // trop commun, sans valeur discriminante
      const idf = Math.log2((N + 1) / (df[term] + 1));
      const s   = termTf * idf * rankWeight;
      if (isolatedTerms.has(term)) {
        scoresIsolated[term] = (scoresIsolated[term] || 0) + s;
      } else {
        scores[term] = (scores[term] || 0) + s;
      }
    }
  });

  // Pool principal : termes multi-pages, triés par fréquence d'utilisation desc
  const mainPool = Object.entries(scores)
    .filter(([, score]) => score > 0.005)
    .sort((a, b) => (rawCount[b[0]] || 0) - (rawCount[a[0]] || 0))
    .slice(0, 400)
    .map(([term, score]) => ({ term, score: Math.round(score * 1000) / 1000, count: Math.round((rawCount[term] || 0) * 1000) / 1000 }));

  // Queue rare : meilleurs termes isolés (1 page), triés par fréquence aussi
  const rarePool = Object.entries(scoresIsolated)
    .filter(([, score]) => score > 0.005)
    .sort((a, b) => (rawCount[b[0]] || 0) - (rawCount[a[0]] || 0))
    .slice(0, 500 - mainPool.length)
    .map(([term, score]) => ({ term, score: Math.round(score * 1000) / 1000, count: Math.round((rawCount[term] || 0) * 1000) / 1000 }));

  return [...mainPool, ...rarePool];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reranking des termes par intention (BM25 + embeddings)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reranke les termes TF-IDF par proximité sémantique avec l'intention de recherche.
 *
 * Score combiné par terme = 0.35 × TF-IDF + 0.25 × BM25-boost + 0.40 × embedding-sim
 *
 * BM25-boost : les termes présents dans les pages qui "matchent" le mieux le
 *   keyword (BM25 élevé) sont boostés — cf. signal d'intention fort.
 *
 * Embedding-sim : cosine similarity entre l'embedding du keyword et celui du
 *   terme candidat via le modèle local Transformers.js.
 *
 * @param {{ term: string, score: number }[]} tfidfTerms
 * @param {string[][]}                         tokenizedDocs
 * @param {string}                             keyword
 * @returns {Promise<{ term: string, score: number, tfidf: number }[]>}
 */
async function rerankTermsByIntent(tfidfTerms, tokenizedDocs, keyword, rawTokenizedDocs) {
  if (!tfidfTerms.length || !tokenizedDocs.length) return { terms: tfidfTerms, embeddingsMap: new Map() };

  const keywordTokens = tokenize(keyword);

  // ── 1. BM25 boost — score chaque page vs keyword, pondère la présence des termes ──
  const pageScores = computeBm25Scores(keywordTokens, tokenizedDocs);
  const maxBm25    = Math.max(...pageScores, 1);

  // Enrichir chaque doc avec ses n-grams pour que les bigrammes/trigrammes
  // reçoivent aussi un BM25 boost selon la pertinence de leur page
  const ngramDocs = buildNgramDocs(tokenizedDocs, rawTokenizedDocs);
  const bm25Boost = {};
  ngramDocs.forEach((tokens, docIdx) => {
    const normalizedPageScore = pageScores[docIdx] / maxBm25; // 0..1
    for (const term of new Set(tokens)) {
      bm25Boost[term] = (bm25Boost[term] || 0) + normalizedPageScore;
    }
  });

  // ── 2. Embedding similarity : keyword vs chaque terme candidat ───────────────
  // Les n-grams (ex: "hébergement web") sont passés directement au modèle d'embedding —
  // les transformers gèrent les expressions multi-mots mieux que les unigrams isolés
  const terms  = tfidfTerms.map((t) => t.term);
  const embSim = {};
  const termEmbeddingsMap = new Map(); // term → float[] vecteur complet (réutilisé pour le clustering)

  try {
    const embeddings = await getLocalEmbeddings([keyword, ...terms]);
    const kwEmb      = embeddings[0];
    terms.forEach((term, i) => {
      const emb = embeddings[i + 1];
      embSim[term] = cosineSimilarity(kwEmb, emb);
      termEmbeddingsMap.set(term, emb); // stocke le vecteur complet pour le clustering
    });
    const ngramCount = terms.filter((t) => t.includes(' ')).length;
    console.log(`[Semantic] Embedding reranking: ${terms.length} termes (${ngramCount} n-grams), top-3 sim: ${
      terms.slice(0, 3).map((t) => `${t}=${(embSim[t] || 0).toFixed(2)}`).join(', ')
    }`);
  } catch (err) {
    console.warn('[Semantic] Erreur embeddings reranking termes, fallback 0.5:', err.message);
    terms.forEach((term) => { embSim[term] = 0.5; });
  }

  // ── 3. Filtre dur par similarité sémantique (embedding threshold) ───────────
  // N-grams : seuil 0.55 (structure multi-mots doit être sémantiquement proche)
  // Unigrams : seuil 0.48 (plus tolérant — un terme seul peut être indirectement lié)
  const EMB_THRESH_NGRAM  = 0.55;
  const EMB_THRESH_UNI    = 0.48;
  const EMB_THRESH_LO     = 0.38; // fallback global si trop peu survivent

  let filtered = tfidfTerms.filter((t) => {
    const sim  = embSim[t.term] || 0;
    const thr  = t.term.includes(' ') ? EMB_THRESH_NGRAM : EMB_THRESH_UNI;
    return sim >= thr;
  });
  if (filtered.length < 30) {
    filtered = tfidfTerms.filter((t) => (embSim[t.term] || 0) >= EMB_THRESH_LO);
    console.log(`[Semantic] Embedding filter fallback →${EMB_THRESH_LO}: ${filtered.length} termes retenus`);
  } else {
    const ngramKept = filtered.filter((t) => t.term.includes(' ')).length;
    console.log(`[Semantic] Embedding filter (ngram≥${EMB_THRESH_NGRAM} uni≥${EMB_THRESH_UNI}): ${filtered.length}/${tfidfTerms.length} termes retenus (dont ${ngramKept} n-grams)`);
  }

  // ── 4. Score combiné ──────────────────────────────────────────────────────────
  // N-grams : poids embedding plus élevé (signal sémantique plus fiable pour les phrases)
  // Unigrams : équilibre classique TF-IDF / BM25 / embedding
  const maxTfidf = filtered[0]?.score || tfidfTerms[0]?.score || 1;

  const reranked = filtered
    .map((t) => {
      const isNgram   = t.term.includes(' ');
      const tfidfNorm = t.score / maxTfidf;
      const bm25Norm  = Math.min(1, (bm25Boost[t.term] || 0) / tokenizedDocs.length);
      // normalise embedSim : seuil bas 0.40 → 0.0, parfait 1.0 → 1.0
      const embNorm   = Math.max(0, ((embSim[t.term] || 0.5) - 0.40) / 0.60);
      const combined  = isNgram
        ? 0.25 * tfidfNorm + 0.15 * bm25Norm + 0.60 * embNorm  // n-gram : embedding prioritaire
        : 0.35 * tfidfNorm + 0.25 * bm25Norm + 0.40 * embNorm; // unigram : équilibre
      return { term: t.term, score: Math.round(combined * 1000) / 1000, tfidf: t.score, count: t.count || 0 };
    })
    // Tri final : nombre d'utilisations dans le corpus (fréquence brute) desc
    .sort((a, b) => b.count - a.count);

  // Retourne les termes rerankés ET la map d'embeddings (réutilisée pour le clustering)
  return { terms: reranked, embeddingsMap: termEmbeddingsMap };
}

// ─────────────────────────────────────────────────────────────────────────────
// Groupes sémantiques — expressions récurrentes 2-4 mots issues des SERP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait les expressions récurrentes (2–4 mots) des pages SERP qui sont
 * sémantiquement proches du mot-clé. Ce sont des formulations naturelles
 * vraiment utilisées dans les contenus classés, pas des termes reconstruits.
 *
 * Algorithme :
 *   1. Pour chaque page, extraire toutes les fenêtres de 2-4 mots consécutifs
 *      (sans traverser les frontières de phrases).
 *   2. Garder uniquement les expressions avec ≥ 1 mot hors stop-words.
 *   3. Compter dans combien de pages différentes chaque expression apparaît.
 *   4. Filtrer : couverture ≥ minPages. Trier par couverture desc.
 *   5. Embedder les top candidats + keyword, calculer la similarité cosine.
 *   6. Score final = coverage°0·6 × embeddingSim°0·4  (la fréquence prime).
 *   7. Retourner les topK meilleures expressions, format compatible UI clusters.
 *
 * @param {string[]} pageTexts  Textes bruts des pages SERP (avec accents)
 * @param {string}   keyword    Mot-clé principal
 * @param {{ topK?: number, minPages?: number, maxEmbed?: number }} opts
 * @returns {Promise<{ clusterId: number, label: string, terms: { term: string, display: string, score: number }[], score: number, pageCount: number }[]>}
 */
async function extractSerpPhrases(pageTexts, keyword, {
  topK     = 20,   // nb maximal d’expressions retournées
  minPages = 2,    // doit apparaître dans au moins N pages distinctes
  maxEmbed = 80,   // nb max de candidats soumis à l’embedding (coût)
} = {}) {
  if (!pageTexts.length) return [];

  // Séparateur de mots : espaces + ponctuation courante
  // NOTE: on conserve les lettres accentuées (À-ÿ)
  const WORD_SEP = /[\s\u00A0\u200B,.!?;:()\/\[\]{}<>"'«»—–\-+=#@&|\\]+/;

  // phraseMap : normKey → { display, pages: Set<pageIdx>, count }
  const phraseMap = new Map();
  const numPages  = pageTexts.filter(Boolean).length;

  pageTexts.forEach((text, pageIdx) => {
    if (!text) return;

    // Découper en phrases pour éviter les fenêtres inter-phrases
    const sentences = text.split(/(?<=[.!?\u2026])\s+/);

    for (const sentence of sentences) {
      // Tokens bruts : lowercase avec accents préservés
      const rawTokens = sentence
        .split(WORD_SEP)
        .map((w) => w.toLowerCase().replace(/[^a-zA-Z\u00C0-\u00FF0-9]/g, ''))
        .filter((w) => w.length >= 2);

      if (rawTokens.length < 2) continue;

      // Fênêtres de taille 2, 3, 4
      for (let n = 2; n <= 4; n++) {
        for (let i = 0; i <= rawTokens.length - n; i++) {
          const window      = rawTokens.slice(i, i + n);
          const normTokens  = window.map(normalizeToken);

          // Au moins 1 mot non-stop de ≥ 3 lettres
          const contentCount = normTokens.filter(
            (t) => t.length >= 3 && !FR_STOP_WORDS.has(t)
          ).length;
          if (contentCount < 1) continue;

          // Clé normalisée (sans accents) pour la déduplication
          const normKey = normTokens.join(' ');
          if (normKey.length < 4) continue;

          if (!phraseMap.has(normKey)) {
            // Forme d’affichage : lowercase + accents (window déjà lowercase)
            phraseMap.set(normKey, {
              display:  window.join(' '),
              pages:    new Set(),
              count:    0,
            });
          }
          const entry = phraseMap.get(normKey);
          entry.pages.add(pageIdx);
          entry.count++;
        }
      }
    }
  });

  // ── Filtrer candidats par couverture de pages ────────────────────────────
  const candidates = [];
  for (const [normKey, { display, pages, count }] of phraseMap) {
    if (pages.size < minPages) continue;
    candidates.push({ normKey, display, pageCount: pages.size, coverage: pages.size / numPages, count });
  }

  if (!candidates.length) {
    console.log('[Semantic] extractSerpPhrases: aucun candidat après filtre page-coverage');
    return [];
  }

  // Trier par couverture desc, puis count desc
  candidates.sort((a, b) => b.coverage - a.coverage || b.count - a.count);
  const topCandidates = candidates.slice(0, maxEmbed);
  console.log(`[Semantic] extractSerpPhrases: ${candidates.length} candidats, top-${topCandidates.length} soumis à l'embedding`);

  // ── Embedding : keyword vs expressions candidates ────────────────────────
  const embSim = {};
  try {
    const texts      = [keyword, ...topCandidates.map((c) => c.display)];
    const embeddings = await getLocalEmbeddings(texts);
    const kwEmb      = embeddings[0];
    topCandidates.forEach((c, i) => {
      embSim[c.normKey] = cosineSimilarity(kwEmb, embeddings[i + 1]);
    });
  } catch (err) {
    console.warn('[Semantic] extractSerpPhrases: erreur embedding, fallback 0.45:', err.message);
    topCandidates.forEach((c) => { embSim[c.normKey] = 0.45; });
  }

  // ── Score final + filtre similarité + déduplication sur chevauchement ──────
  const MIN_SIM = 0.38; // seuil bas — les expressions peuvent être indirectement liées
  const scored = topCandidates
    .map((c) => {
      const sim = embSim[c.normKey] ?? 0.45;
      if (sim < MIN_SIM) return null;
      // coverage^0.6 × sim^0.4  : la récurrence prime, la sémantique écarte le bruit
      const score = Math.round(Math.pow(c.coverage, 0.6) * Math.pow(sim, 0.4) * 1000) / 1000;
      return { ...c, sim, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  // Déduplication greedy : supprimer les expressions trop similaires entre elles
  // (ex: "hébergement web" et "meilleur hébergement web" couvrent la même idée)
  const selected = [];
  for (const phrase of scored) {
    // Vérifier si cette expression est une sous-expression déjà sélectionnée
    const isSubsumed = selected.some((s) =>
      s.normKey.includes(phrase.normKey) || phrase.normKey.includes(s.normKey)
    );
    if (!isSubsumed) selected.push(phrase);
    if (selected.length >= topK) break;
  }

  console.log(`[Semantic] Groupes sémantiques: ${selected.length} expressions extraites des SERP`);

  // ── Format de sortie (compatible UI clusters) ─────────────────────────
  return selected.map((p, i) => ({
    clusterId: i + 1,
    label:     p.display,
    terms:     [{ term: p.normKey, display: p.display, score: p.score }],
    score:     p.score,
    pageCount: p.pageCount,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// DataForSEO — keywords_for_keywords
// ─────────────────────────────────────────────────────────────────────────────

async function getRelatedFromDataForSEO(keyword) {
  try {
    const headers = {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    };

    const payload = [
      {
        keywords:      [keyword],
        language_code: 'fr',
        location_code: 2250,
        limit:         100,
        order_by:      ['search_volume,desc'],
      },
    ];

    const response = await axios.post(
      `${BASE_URL}/keywords_data/google_ads/keywords_for_keywords/live`,
      payload,
      { headers }
    );

    const task0 = response.data?.tasks?.[0];
    if (task0?.status_code !== 20000) {
      console.warn(`[Semantic] DataForSEO keywords_for_keywords: ${task0?.status_message}`);
      return [];
    }

    const items = task0?.result?.[0]?.items || [];

    return items
      .filter((i) => i.keyword && (i.search_volume || 0) >= 50)
      .sort((a, b) => (b.search_volume || 0) - (a.search_volume || 0))
      .slice(0, 50)
      .map((i) => ({
        keyword:     i.keyword,
        volume:      i.search_volume || 0,
        competition: i.competition_index ?? null,
      }));
  } catch (err) {
    console.error('[Semantic] DataForSEO keywords_for_keywords error:', err?.response?.data ?? err?.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Claude Haiku — synthèse et structuration
// ─────────────────────────────────────────────────────────────────────────────

async function refineWithClaude(tfidfTerms, relatedKws, serpResults, mainKeyword) {
  const client = new Anthropic();

  // Utiliser la forme accentuée (display) pour que Claude reçoive du vrai français
  const topTerms = tfidfTerms.slice(0, 500).map((t) => t.display || t.term).join(', ');
  // Note: tfidfTerms are already reranked by intent (BM25 + embedding similarity)
  const topRelated = relatedKws
    .slice(0, 30)
    .map((k) => `${k.keyword} (vol. ${k.volume})`)
    .join(', ');
  const snippets = serpResults
    .slice(0, 10)
    .map((s, i) => `#${i + 1} ${s.title || ''} — ${s.description || ''}`)
    .join('\n');

  const prompt = `Tu es un expert SEO spécialisé dans l'analyse sémantique de contenu web.

Mot-clé principal : "${mainKeyword}"

Snippets SERP (titre + meta description des résultats Google top 10) :
${snippets || '(aucun snippet disponible)'}

Termes extraits des pages concurrentes, **triés par proximité avec l'intention de recherche** (BM25 + similarité sémantique) :
${topTerms || '(aucun terme extrait)'}

Mots-clés connexes DataForSEO (avec volume de recherche mensuel) :
${topRelated || '(aucun mot-clé connexe disponible)'}

En croisant ces 3 sources, génère une analyse sémantique structurée.

RÈGLES :
- Ne répète pas le mot-clé principal exact dans les listes (sauf variations)
- Priorise les termes qui apparaissent dans plusieurs sources à la fois
- Les longTailVariants doivent être des expressions de 3+ mots avec intention claire
- Les entities sont des noms propres, marques, outils, acronymes techniques
- Les coOccurrences sont des paires de mots qui vont naturellement ensemble (format "terme A + terme B")
- Les contentGaps sont des angles ou sous-thèmes traités par les concurrents mais souvent oubliés
- Tous les termes en français

Réponds UNIQUEMENT avec ce JSON (aucun texte avant ou après) :
{
  "intent": "<l'une des 4 intentions : informationnelle | transactionnelle | navigationnelle | commerciale>",
  "contentFormat": "<format dominant parmi : guide | liste | comparaison | définition | tutoriel | avis>",
  "avgWordCount": <estimation du nombre moyen de mots des articles concurrents (entre 800 et 4000)>,
  "dominantSubtopics": [<6-10 sous-thèmes / H2 dominants que couvrent les concurrents>],
  "faqQuestions": [<4-8 questions fréquemment posées sur ce sujet>],
  "primaryTerms": [<8-12 termes sémantiques incontournables — synonymes et variantes directes>],
  "secondaryTerms": [<10-15 termes complémentaires pour couvrir le sujet en profondeur>],
  "longTailVariants": [<8-12 expressions longue traîne 3+ mots avec forte intention>],
  "entities": [<6-10 entités nommées : marques, outils, lieux, personnes, concepts spécifiques>],
  "semanticField": [<10-15 mots du champ lexical : synonymes, hyperonymes, hyponymes>],
  "coOccurrences": [<8-10 paires de termes fréquemment associés — format "terme A + terme B">],
  "contentGaps": [<4-6 sous-thèmes traités par les concurrents mais souvent absents des articles standards>]
}`;

  try {
    const message = await claudeCreateWithSearch(client, {
      model:      'claude-sonnet-4-5-20250929',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw     = extractTextContent(message);
    const jsonStr = raw.startsWith('{') ? raw : raw.match(/\{[\s\S]*\}/)?.[0] || '{}';
    const parsed  = JSON.parse(jsonStr);

    return {
      intent:           typeof parsed.intent         === 'string'  ? parsed.intent           : 'informationnelle',
      contentFormat:    typeof parsed.contentFormat  === 'string'  ? parsed.contentFormat    : 'guide',
      avgWordCount:     typeof parsed.avgWordCount   === 'number'  ? parsed.avgWordCount     : 1500,
      dominantSubtopics: Array.isArray(parsed.dominantSubtopics) ? parsed.dominantSubtopics : [],
      faqQuestions:     Array.isArray(parsed.faqQuestions)       ? parsed.faqQuestions       : [],
      primaryTerms:     Array.isArray(parsed.primaryTerms)       ? parsed.primaryTerms       : [],
      secondaryTerms:   Array.isArray(parsed.secondaryTerms)     ? parsed.secondaryTerms     : [],
      longTailVariants: Array.isArray(parsed.longTailVariants)   ? parsed.longTailVariants   : [],
      entities:         Array.isArray(parsed.entities)           ? parsed.entities           : [],
      semanticField:    Array.isArray(parsed.semanticField)      ? parsed.semanticField       : [],
      coOccurrences:    Array.isArray(parsed.coOccurrences)      ? parsed.coOccurrences      : [],
      contentGaps:      Array.isArray(parsed.contentGaps)        ? parsed.contentGaps        : [],
    };
  } catch (err) {
    console.error('[Semantic] Erreur Claude Haiku refine:', err.message);
    return {
      intent:            'informationnelle',
      contentFormat:     'guide',
      avgWordCount:      1500,
      dominantSubtopics: [],
      faqQuestions:      [],
      primaryTerms:      [],
      secondaryTerms:    [],
      longTailVariants:  [],
      entities:          [],
      semanticField:     [],
      coOccurrences:     [],
      contentGaps:       [],
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Analyse sémantique complète d'un mot-clé.
 *
 * @param {string} keyword           - Mot-clé principal
 * @param {Array}  serpResults       - Résultats SERP [{rank, title, description, url, domain}]
 * @returns {Promise<SemanticAnalysis>}
 */
export async function analyzeSemanticKeywords(keyword, serpResults) {
  console.log(`[Semantic] Lancement analyse sémantique pour "${keyword}" (${serpResults.length} résultats SERP)`);

  if (!serpResults || serpResults.length === 0) {
    console.warn('[Semantic] Aucun résultat SERP — retour analyse vide');
    return buildEmptyAnalysis(keyword);
  }

  // 1. Pré-classification SERP : ne garder que les articles (blog / guide / tuto)
  //    Opère sur URL + titre uniquement (pas de fetch), scan jusqu'à MAX_SERP_SCAN positions.
  //    Forums, réseaux sociaux, homepages, pages produit → exclus systématiquement.
  const EXCLUDED_TYPES = new Set(['forum', 'homepage', 'product_page']);

  const serpToScan    = serpResults.slice(0, MAX_SERP_SCAN);
  const preclassified = serpToScan.map((r) => ({ ...r, pageType: classifyPageType(r.url, r.title) }));

  // Log de la distribution pour diagnostic
  const typeCounts = {};
  for (const r of preclassified) typeCounts[r.pageType] = (typeCounts[r.pageType] || 0) + 1;
  const typeDistrib = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  console.log(`[Semantic] Distribution types SERP: ${typeDistrib.map(([k, v]) => `${k}:${v}`).join(', ')}`);

  // Garder uniquement les pages éditoriales (blog, guide, tuto, comparatif, catégorie)
  let filteredSerp = preclassified.filter((r) => !EXCLUDED_TYPES.has(r.pageType));

  if (filteredSerp.length < MIN_HOMOGENEOUS) {
    console.warn(`[Semantic] Seulement ${filteredSerp.length} pages éditoriales sur ${serpToScan.length} — utilisation de toutes les pages non-forum/homepage`);
    // Dernier recours : tout sauf forum et homepage stricts
    filteredSerp = preclassified.filter((r) => r.pageType !== 'forum' && r.pageType !== 'homepage');
  }

  const serpToFetch = filteredSerp.slice(0, MAX_PAGES);
  const urlsToFetch = serpToFetch.map((r) => r.url).filter(Boolean);
  console.log(`[Semantic] Pages retenues: ${serpToFetch.length} (${serpToFetch.map((r) => r.pageType).join(', ')}) — fetch: ${urlsToFetch.length}`);

  // Fetch contenu des pages filtrées (en parallèle avec les mots-clés connexes)
  const [pageContents, relatedKws] = await Promise.all([
    Promise.all(urlsToFetch.map(fetchPageContent)),
    getRelatedFromDataForSEO(keyword),
  ]);

  const fetchedCount = pageContents.filter(Boolean).length;
  console.log(`[Semantic] Pages récupérées: ${fetchedCount}/${urlsToFetch.length} — DataForSEO: ${relatedKws.length} mots-clés connexes`);

  // 2. TF-IDF sur le corpus + build pagesMeta + collecte des textes pour BM25/embeddings
  let tfidfTerms = [];
  let termDistribution = [];
  const tokenizedDocs    = []; // tokens sans stop-words (unigrams TF-IDF)
  const rawTokenizedDocs = []; // tokens avec stop-words (fenêtres n-gram)
  const pagesMeta = [];     // metadata for each successfully fetched page
  const pageTexts  = [];    // raw texts aligned with tokenizedDocs (for scoring)
  const wordCounts = [];    // full word counts per crawled page (before truncation)

  pageContents.forEach((content, i) => {
    if (!content || !content.text) return;
    const serpEntry = serpToFetch[i] || null;
    pagesMeta.push({
      idx: pagesMeta.length,
      url: serpEntry?.url || urlsToFetch[i] || '',
      domain: serpEntry?.domain || '',
      title: serpEntry?.title || '',
      rank: serpEntry?.rank || (i + 1),
    });
    tokenizedDocs.push(tokenize(content.text));
    rawTokenizedDocs.push(rawTokenize(content.text));
    pageTexts.push(content.text);
    if (content.fullWordCount > 0) wordCounts.push(content.fullWordCount);
  });

  // Nombre moyen de mots des pages SERP crawlées (mesure réelle, pas estimation IA)
  const serpCrawledAvgWordCount = wordCounts.length > 0
    ? Math.round(wordCounts.reduce((s, w) => s + w, 0) / wordCounts.length)
    : null;

  if (tokenizedDocs.length > 0) {
    // Enrichir les docs avec bigrammes + trigrammes + 4-grams pour le TF-IDF
    // rawTokenizedDocs permet de conserver les prépositions dans les n-grams
    const ngramDocs = buildNgramDocs(tokenizedDocs, rawTokenizedDocs);
    tfidfTerms = computeTfIdf(ngramDocs);
    const ngramCount = tfidfTerms.filter((t) => t.term.includes(' ')).length;
    console.log(`[Semantic] TF-IDF: ${tfidfTerms.length} termes candidats (${ngramCount} n-grams, ${tfidfTerms.length - ngramCount} unigrams)`);

    // Reranking par intention : BM25 boost + cosine similarity embedding vs keyword
    // tokenizedDocs (unigrams) pour le scoring BM25 des pages ; ngramDocs construit en interne
    const { terms: rerankedTerms, embeddingsMap } = await rerankTermsByIntent(tfidfTerms, tokenizedDocs, keyword, rawTokenizedDocs);
    tfidfTerms = rerankedTerms;
    console.log(`[Semantic] Reranking: top-5 = ${tfidfTerms.slice(0, 5).map((t) => t.display || t.term).join(', ')}`);

    // ── Consolidation sémantique : fusionne variantes morphologiques ──────────
    const beforeConsolidate = tfidfTerms.length;
    tfidfTerms = consolidateTerms(tfidfTerms);
    // ── Élagage des n-grams redondants : retire trigrammes < bigram sous-phrase ─
    tfidfTerms = pruneRedundantNgrams(tfidfTerms);
    console.log(`[Semantic] Consolidation: ${beforeConsolidate} → ${tfidfTerms.length} termes après fusion+élagage`);

    // ── Comptages min / max / cible par terme (normalisés pour 1000 tokens) ─────────
    // Pour chaque terme on calcule, sur les pages où il apparait :
    //   minCount  = occurrence minimale (/1000 tokens, arrondi)
    //   maxCount  = occurrence maximale (/1000 tokens, arrondi)
    //   target    = milieu de la plage → objectif pour l'article généré
    // Formes originales accentuées (ex: "référencement" pour le normalisé "referencement")
    const normalizedSet = new Set(tfidfTerms.map((t) => t.term));
    const originalForms = buildOriginalForms(pageTexts, normalizedSet);

    tfidfTerms = tfidfTerms.map(({ term, score, tfidf }) => {
      // Pour les n-grams, compter dans ngramDocs ; pour les unigrams dans tokenizedDocs
      const isNgram   = term.includes(' ');
      const sourceDocs = isNgram ? ngramDocs : tokenizedDocs;
      const countsRaw = sourceDocs.map((tokens, i) => {
        const raw = tokens.filter((t) => t === term).length;
        // Toujours normaliser par le nombre d'unigrams de la page (base cohérente)
        return raw > 0 ? Math.round((raw / Math.max(tokenizedDocs[i].length, 1)) * 1000) : 0;
      });
      const nonZero  = countsRaw.filter((c) => c > 0);
      const minCount = nonZero.length > 0 ? Math.min(...nonZero) : 0;
      const maxCount = nonZero.length > 0 ? Math.max(...nonZero) : 0;
      const target   = Math.round((minCount + maxCount) / 2);
      const display  = originalForms[term] || term; // forme accentuée pour affichage et Claude
      return { term, score, tfidf, minCount, maxCount, target, display };
    });

    // Distribution des top 20 termes reranked par page (avec counts réels)
    const top20 = tfidfTerms.slice(0, 20);
    termDistribution = top20.map(({ term, display, minCount, maxCount, target }) => {
      const isNgram    = term.includes(' ');
      const sourceDocs = isNgram ? ngramDocs : tokenizedDocs;
      return {
        term,
        display,
        presences: sourceDocs.map((tokens) => tokens.includes(term)),
        counts:    sourceDocs.map((tokens) => tokens.filter((t) => t === term).length),
        minCount, maxCount, target,
      };
    });

  }

  // 3. Synthèse Claude Haiku
  const analysis = await refineWithClaude(tfidfTerms, relatedKws, serpResults, keyword);

  console.log(
    `[Semantic] Résultat final — primaryTerms: ${analysis.primaryTerms.length}, ` +
    `longTail: ${analysis.longTailVariants.length}, contentGaps: ${analysis.contentGaps.length}, ` +
    `serpCrawledAvgWordCount: ${serpCrawledAvgWordCount ?? 'n/a'} mots`
  );

  return {
    keyword,
    pagesAnalyzed:    tokenizedDocs.length,
    serpCrawledAvgWordCount,              // nombre moyen de mots des pages SERP réellement crawlées
    intentTopTerms:   tfidfTerms,           // tous les termes rerankés par intention (BM25 + embeddings)
    tfidfTopTerms:    tfidfTerms,           // alias for backward compat
    termDistribution,
    clusters:         [],                   // supprimé — groupes sémantiques retirés
    pagesMeta,
    pageTexts,
    classifiedSerp:   preclassified,        // résultats SERP avec pageType pour affichage frontend
    relatedKws:       relatedKws.slice(0, 20),
    ...analysis,
    generatedAt:      new Date().toISOString(),
  };
}

function buildEmptyAnalysis(keyword) {
  return {
    keyword,
    pagesAnalyzed:     0,
    serpCrawledAvgWordCount: null,
    intentTopTerms:    [],
    tfidfTopTerms:     [],
    termDistribution:  [],
    clusters:          [],
    pagesMeta:         [],
    pageTexts:         [],
    relatedKws:        [],
    intent:            'informationnelle',
    contentFormat:     'guide',
    avgWordCount:      1500,
    dominantSubtopics: [],
    faqQuestions:      [],
    primaryTerms:      [],
    secondaryTerms:    [],
    longTailVariants:  [],
    entities:          [],
    semanticField:     [],
    coOccurrences:     [],
    contentGaps:       [],
    generatedAt:       new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BM25
// ─────────────────────────────────────────────────────────────────────────────

const BM25_K1 = 1.5;
const BM25_B  = 0.75;

/**
 * BM25 : score chaque document du corpus pour la requête articleTokens.
 * @param {string[]}   queryTokens
 * @param {string[][]} corpusTokens
 * @returns {number[]}  score BM25 par document
 */
function computeBm25Scores(queryTokens, corpusTokens) {
  const N = corpusTokens.length;
  if (N === 0 || queryTokens.length === 0) return [];

  const avgDocLen = corpusTokens.reduce((s, d) => s + d.length, 0) / N;

  const df = {};
  for (const doc of corpusTokens) {
    for (const term of new Set(doc)) df[term] = (df[term] || 0) + 1;
  }

  return corpusTokens.map((doc) => {
    const tf = {};
    for (const term of doc) tf[term] = (tf[term] || 0) + 1;

    let score = 0;
    for (const term of new Set(queryTokens)) {
      if (!tf[term]) continue;
      const n   = df[term] || 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const tfN = (tf[term] * (BM25_K1 + 1)) /
        (tf[term] + BM25_K1 * (1 - BM25_B + BM25_B * doc.length / avgDocLen));
      score += idf * tfN;
    }
    return score;
  });
}

/**
 * Score lexical BM25 de l'article vs le corpus SERP, normalisé 0-100.
 */
function computeBm25Score(articleTokens, pageTokensArray) {
  if (!pageTokensArray || pageTokensArray.length === 0) return 50;
  const scores   = computeBm25Scores(articleTokens, pageTokensArray);
  const avgScore = scores.reduce((s, v) => s + v, 0) / scores.length;
  // Normalisation via tanh : raw≈10 → 58, raw≈15 → 76, raw≈20 → 87, raw≈30 → 96
  return Math.min(100, Math.max(0, Math.round(Math.tanh(avgScore / 15) * 100)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Embeddings locaux (Transformers.js) + cosine similarity
// ─────────────────────────────────────────────────────────────────────────────

// Modèle multilingue léger, excellent pour le français/SEO, ~120 MB (téléchargé une seule fois)
const EMBED_MODEL    = 'Xenova/multilingual-e5-small';
const EMBED_TRUNCATE = 2000; // chars max par texte

// Singleton : le pipeline est initialisé une seule fois au premier appel.
// _pipelinePromise est assigné AVANT le premier await pour éviter la race condition
// entre deux jobs concurrents (sinon le modèle serait chargé 2× → OOM + crash).
let _pipelinePromise = null;
async function getEmbeddingPipeline() {
  if (!_pipelinePromise) {
    _pipelinePromise = (async () => {
      // Import dynamique pour ne pas bloquer le démarrage du serveur
      const { pipeline } = await import('@huggingface/transformers');
      const pipe = await pipeline('feature-extraction', EMBED_MODEL, { progress_callback: null });
      console.log(`[Semantic] Pipeline Transformers.js «${EMBED_MODEL}» initialisé`);
      return pipe;
    })();
  }
  return _pipelinePromise;
}

async function getLocalEmbeddings(texts) {
  const extractor = await getEmbeddingPipeline();
  const inputs    = texts.map((t) => (t || '').substring(0, EMBED_TRUNCATE));

  // Transformers.js retourne un Tensor [batchSize × seqLen × hiddenSize]
  // pooling='mean' + normalize=true donne un vecteur unitaire par texte
  const output = await extractor(inputs, { pooling: 'mean', normalize: true });
  return output.tolist(); // float[][]
}

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return (magA === 0 || magB === 0) ? 0 : dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Score sémantique via embeddings : moyenne des top-3 cosine similarities (0-100).
 */
async function computeEmbeddingScore(articleText, pageTexts) {
  if (!pageTexts || pageTexts.length === 0) return 50;

  const embeddings  = await getLocalEmbeddings([articleText, ...pageTexts]);
  const articleEmb  = embeddings[0];
  const pageEmbeds  = embeddings.slice(1);

  const similarities = pageEmbeds.map((pe) => cosineSimilarity(articleEmb, pe));
  const top3         = [...similarities].sort((a, b) => b - a).slice(0, 3);
  const avgSim       = top3.reduce((s, v) => s + v, 0) / top3.length;

  // Typiquement : bon article ~0.80, moyen ~0.65, mauvais ~0.50
  // Normalisation : 0.50 → 0, 0.80 → 67, 0.95 → 100
  return Math.min(100, Math.max(0, Math.round(((avgSim - 0.50) / 0.45) * 100)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Score SEO principal : BM25 + Embeddings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare l'article généré au corpus SERP via BM25 (lexical) + embeddings (sémantique).
 * Remplace scoreSerpCoverage() — renvoie un objet compatible CoverageScore enrichi.
 *
 * finalScore = 0.4 × bm25Score + 0.6 × semanticScore
 *
 * @param {string}   articleText  Texte brut de l'article
 * @param {string[]} pageTexts    Textes des pages SERP (stockés dans semanticAnalysis.pageTexts)
 * @param {object}   [serpModel]  Optionnel — pour topicCoverage / entityCoverage / wordScore
 * @returns {Promise<object>}
 */
export async function scoreArticleVsSerp(articleText, pageTexts = [], serpModel = null) {
  if (!articleText) {
    return { totalScore: 0, bm25Score: 0, semanticScore: 0,
             topicCoverage: 0, entityCoverage: 0, wordScore: 0, faqScore: 0, intentScore: 0 };
  }

  const articleTokens = tokenize(articleText);
  const pageTokensArr = pageTexts.map((t) => tokenize(t));

  // 1. BM25 lexical
  const bm25Score = computeBm25Score(articleTokens, pageTokensArr);

  // 2. Semantic embeddings (Transformers.js local) — fallback BM25 si erreur
  let semanticScore = bm25Score;
  if (pageTexts.length > 0) {
    try {
      semanticScore = await computeEmbeddingScore(articleText, pageTexts);
    } catch (embedErr) {
      console.warn('[Semantic] Erreur embeddings Transformers.js, fallback BM25 seul:', embedErr.message);
    }
  }

  // 3. Score final pondéré
  const finalScore = Math.round(0.4 * bm25Score + 0.6 * semanticScore);

  // 4. Champs rétrocompatibles issus du serpModel (affichage UI)
  let topicCoverage = 100, entityCoverage = 100, wordScore = 100, faqScore = 100, intentScore = 100;
  if (serpModel) {
    const lc = articleText.toLowerCase();

    // Comparaison insensible aux accents : normalise le texte ET les termes
    const lcNoAccent = stripAccents(articleText.toLowerCase());

    const topicHits = (serpModel.dominantSubtopics ?? []).filter((t) =>
      lcNoAccent.includes(stripAccents(t.toLowerCase()))
    ).length;
    topicCoverage   = serpModel.dominantSubtopics?.length > 0
      ? Math.round((topicHits / serpModel.dominantSubtopics.length) * 100) : 100;

    const entityHits = (serpModel.recurringEntities ?? []).filter((e) =>
      lcNoAccent.includes(stripAccents(e.toLowerCase()))
    ).length;
    entityCoverage   = serpModel.recurringEntities?.length > 0
      ? Math.round((entityHits / serpModel.recurringEntities.length) * 100) : 100;

    const articleWords = articleText.trim().split(/\s+/).length;
    const targetWords  = Math.round((serpModel.avgWordCount ?? 1000) * 1.1);
    const ratio        = articleWords / targetWords;
    wordScore = ratio >= 0.9 && ratio <= 1.5
      ? 100
      : ratio >= 0.6 && ratio < 0.9
        ? Math.round(50 + ((ratio - 0.6) / 0.3) * 50)
        : Math.round(Math.max(0, 100 - Math.abs(ratio - 1.2) * 80));

    faqScore = !serpModel.hasFaq ? 100
      : (lc.includes('faq') || lc.includes('question') || lc.includes('<details>')) ? 100 : 0;

    const intentMap = {
      informationnelle: ['comment', 'pourquoi', 'guide'],
      transactionnelle: ['acheter', 'prix', 'devis'],
      commerciale:      ['comparatif', 'avis', 'test'],
      navigationnelle:  ['site', 'accès', 'connexion'],
    };
    intentScore = (intentMap[serpModel.intent] ?? []).some((s) => lc.includes(s)) ? 100 : 50;
  }

  console.log(`[Semantic] Score SEO — BM25: ${bm25Score}/100, Embeddings: ${semanticScore}/100, Final: ${finalScore}/100`);

  return { totalScore: finalScore, bm25Score, semanticScore,
           topicCoverage, entityCoverage, wordScore, faqScore, intentScore };
}

/**
 * Vérifie quelle proportion des termes prioritaires (intentTopTerms) sont
 * utilisés dans l’article à une fréquence comprise dans la plage [minCount, maxCount].
 * La comparaison est insensible aux accents : "référencement" == "referencement".
 *
 * @param {string} articleText    - Texte brut de l’article
 * @param {Array}  intentTopTerms - Tableau issu de semanticAnalysis.intentTopTerms
 *                                  (chaque élément a .term, .display, .minCount, .maxCount)
 * @returns {{ pct: number, inRange: number, total: number, details: Array }}
 */
export function scoreTermsInRange(articleText, intentTopTerms) {
  if (!articleText || !intentTopTerms?.length) return { pct: 100, inRange: 0, total: 0, details: [] };

  const articleTokens = tokenize(articleText);
  const totalWords    = Math.max(articleTokens.length, 1);
  const lcNoAccent    = stripAccents(articleText.toLowerCase());

  const checkable = intentTopTerms.filter(
    (t) => t.minCount !== undefined && t.maxCount !== undefined && t.maxCount > 0
  );
  if (checkable.length === 0) return { pct: 100, inRange: 0, total: 0, details: [] };

  const details = checkable.map((t) => {
    let count;
    if (t.term.includes(' ')) {
      // N-gram : sous-chaîne insensible aux accents
      const needle = stripAccents(t.term.toLowerCase());
      count = 0;
      let pos = 0;
      while ((pos = lcNoAccent.indexOf(needle, pos)) !== -1) { count++; pos += needle.length; }
    } else {
      // Unigram : cherche dans les tokens normalisés+lemmatizés
      count = articleTokens.filter((tok) => tok === t.term).length;
    }
    const density = Math.round((count / totalWords) * 1000);
    const inRange = density >= t.minCount && density <= t.maxCount;
    return { term: t.display || t.term, density, minCount: t.minCount, maxCount: t.maxCount, inRange };
  });

  const inRangeCount = details.filter((d) => d.inRange).length;
  const pct          = Math.round((inRangeCount / checkable.length) * 100);
  console.log(`[Semantic] Terms-in-range: ${inRangeCount}/${checkable.length} (${pct}%)`);
  return { pct, inRange: inRangeCount, total: checkable.length, details };
}
