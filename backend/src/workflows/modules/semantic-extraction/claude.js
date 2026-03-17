import Anthropic from '@anthropic-ai/sdk';
import { claudeCreate } from '../../../utils/claudeRetry.js';

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY manquant dans .env');
  return new Anthropic({ apiKey });
}

/**
 * Filtre et nettoie une liste de termes sémantiques bruts via Claude Haiku.
 * Supprime les n-grams incompréhensibles, les tokens CSS/UI, corrige
 * l'orthographe et les accents, déduplique, et retourne ~300 termes propres.
 *
 * @param {Array}  terms   - Tableau d'objets {term, display, score, count, ...}
 * @param {string} keyword - Mot-clé principal (contexte SEO)
 * @returns {Promise<Array>} Même structure, filtrée (~300 entrées)
 */
export async function cleanSemanticTerms(terms, keyword) {
  if (!terms?.length) return terms ?? [];
  const client = getClient();

  const normalize = (s) =>
    (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  const rawLabels = terms.slice(0, 500).map((t) => t.display || t.term);
  const byNorm = new Map(terms.map((t) => [normalize(t.display || t.term), t]));
  const numbered = rawLabels.map((label, i) => `${i + 1}. ${label}`).join('\n');

  const prompt = `Tu es un expert SEO français. Voici une liste numérotée de termes-clés bruts extraits automatiquement pour le mot-clé : "${keyword}".

RÈGLE ABSOLUE : tu ne dois JAMAIS inventer ou ajouter un terme qui n'est pas dans cette liste. Tu travailles UNIQUEMENT sur les termes fournis.

Ta mission (dans l'ordre) :
1. SUPPRIMER uniquement les termes clairement inutilisables : CSS/HTML brut ("overflow hidden", "border radius", "px", "rgba"), codes hex, URLs complètes, noms de variables code, fragments incompréhensibles de moins de 3 caractères
2. CORRIGER uniquement l'orthographe et les accents des termes conservés (ex: "creation" → "création", "referencement" → "référencement") — sans changer le sens ni inventer
3. DÉDUPLIQUER : si deux termes sont identiques ou quasi-identiques après correction, garder le plus propre
4. SUPPRIMER les noms d'auteurs de blog et noms de personnes peu ou pas connues
5. CONSERVER les termes génériques s'ils ont une valeur SEO dans le contexte du mot-clé (ex: "guide", "comparatif", "prix", "avis" sont utiles)
6. RETOURNER au moins 200 termes si possible — objectif 250 à 300 — triés par pertinence SEO décroissante

Format de réponse — UNIQUEMENT ce tableau JSON, sans aucun texte autour :
[{"i": 3, "v": "terme corrigé"}, {"i": 7, "v": "autre terme"}, ...]

- "i" = numéro du terme dans la liste (1-based)
- "v" = version nettoyée/corrigée (si aucune correction nécessaire, reprendre exactement le terme original)

Liste numérotée :
${numbered}`;

  try {
    const message = await claudeCreate(client, {
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 8192,
      messages:   [{ role: 'user', content: prompt }],
    });
    const raw     = message.content[0].text.trim();
    const jsonStr = raw.startsWith('[') ? raw : raw.match(/\[[\s\S]*\]/)?.[0];
    if (!jsonStr) throw new Error('JSON non trouvé dans la réponse');
    const cleaned = JSON.parse(jsonStr);
    if (!Array.isArray(cleaned)) throw new Error('Réponse non-tableau');

    const seenNorm = new Set();
    const result   = [];

    for (const entry of cleaned) {
      if (result.length >= 300) break;

      const idx        = typeof entry === 'object' ? entry.i : null;
      const corrected  = typeof entry === 'object' ? String(entry.v || '').trim() : String(entry).trim();

      let orig = null;
      if (idx != null && idx >= 1 && idx <= rawLabels.length) {
        orig = terms[idx - 1];
      } else {
        orig = byNorm.get(normalize(corrected)) ?? null;
      }

      if (!orig) {
        console.debug(`[Claude] cleanSemanticTerms: terme ignoré (introuvable) "${corrected}"`);
        continue;
      }

      const normV = normalize(corrected);
      if (seenNorm.has(normV)) continue;
      seenNorm.add(normV);

      result.push({ ...orig, display: corrected || orig.display || orig.term });
    }

    console.log(`[Claude] cleanSemanticTerms: ${terms.length} → ${result.length} termes (${rawLabels.length - result.length} supprimés)`);
    return result;
  } catch (err) {
    console.warn('[Claude] cleanSemanticTerms échoué, retour liste originale:', err.message);
    return terms;
  }
}
