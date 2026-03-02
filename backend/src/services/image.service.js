import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { supabase } from '../config/supabase.js';

/**
 * Service de génération et d'hébergement d'images
 * - Gemini 2.0 Flash (image generation) : génération de l'image
 * - Sharp : redimensionnement + conversion AVIF
 * - Supabase Storage : hébergement CDN
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'blog-images';

// Modèle dédié à la génération d'images chez Google
const IMAGE_GEN_MODEL = 'gemini-2.5-flash-image';

/**
 * Convertit un buffer image en AVIF compressé via sharp
 */
async function convertToAvif(inputBuffer) {
  return sharp(inputBuffer)
    .resize(1200, 630, { fit: 'cover', position: 'centre' })
    .avif({ quality: 65, effort: 4 })
    .toBuffer();
}

/**
 * Upload un buffer AVIF vers Supabase Storage
 */
async function uploadAvifToSupabase(avifBuffer, filename) {
  const path = `${filename}.avif`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, avifBuffer, {
      contentType: 'image/avif',
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase Storage error: ${error.message}`);
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, displayUrl: data.publicUrl };
}

/**
 * Génère une image avec Gemini 2.0 Flash, la convertit en AVIF et l'uploade sur Supabase Storage.
 * @param {string} prompt - Description de l'image
 * @param {string} context - Contexte additionnel (titre du blog, mot-clé)
 * @param {string} name - Nom du fichier (sans extension)
 * @returns {Promise<{url: string, displayUrl: string}>}
 */
export async function generateImageWithGemini(prompt, context = '', name = 'generated-image') {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY manquante dans .env');
  }

  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: IMAGE_GEN_MODEL });

    // Build the structured prompt using the standardised JSON template.
    // If Claude provided a rich art-direction prompt, use it as the topic.
    // If it's a short fallback, use it as-is.
    const topic = prompt.trim();

    const imagePrompt = `${JSON.stringify({
      image_generation_request: {
        context: context || 'Blog post hero image',
        topic,
        style_guidelines: {
          art_style: 'Photorealistic or High-end Digital Illustration',
          composition: 'Wide angle, rule of thirds, copy-space available for text overlay',
          lighting: 'Natural soft light, cinematic',
          color_palette: 'Vibrant but professional, harmonized with the topic',
          mood: 'Inspiring and clean',
        },
        technical_constraints: {
          aspect_ratio: '16:9',
          avoid: 'Text in image, distorted faces, blurry backgrounds, messy compositions',
        },
        prompt_template: `A high-quality photorealistic or high-end digital illustration representing ${topic}. The scene should be inspiring and clean with natural soft cinematic lighting. Professional photography style, 8k resolution, highly detailed.`,
      },
    }, null, 2)}

Generate the image described above. No text, no watermark, no logo. 16:9 aspect ratio.`;

    console.log('🎨 Génération image via Gemini...');

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: imagePrompt }] }],
      generationConfig: {
        responseModalities: ['image', 'text'],
      },
    });

    const candidate = result.response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
      (p) => p.inlineData?.mimeType?.startsWith('image/')
    );

    if (!imagePart) {
      throw new Error('Gemini n\'a pas retourné d\'image dans la réponse');
    }

    const rawBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    console.log(`📦 Image générée par Gemini (${(rawBuffer.length / 1024).toFixed(0)} KB, ${imagePart.inlineData.mimeType})`);

    // Convertir en AVIF
    console.log('🔄 Conversion en AVIF...');
    const avifBuffer = await convertToAvif(rawBuffer);
    console.log(`✅ AVIF généré (${(avifBuffer.length / 1024).toFixed(0)} KB)`);

    // Upload sur Supabase Storage
    console.log('☁️ Upload vers Supabase Storage...');
    const uploaded = await uploadAvifToSupabase(avifBuffer, name);
    console.log('✅ Image uploadée:', uploaded.url);

    return uploaded;
  } catch (error) {
    console.warn('⚠️ Génération image ignorée:', error.message);
    return null;
  }
}

/**
 * Génère et uploade une image pour un article de blog.
 * Retourne null si Gemini échoue (pipeline continue sans image).
 * @param {string} keyword - Mot-clé principal
 * @param {string} title - Titre du blog
 * @returns {Promise<{url: string, displayUrl: string}|null>}
 */
export async function getAndUploadBlogImage(keyword, title) {
  try {
    const prompt = `${keyword} - ${title}`;
    const context = `Professional blog article about: ${keyword}`;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    return await generateImageWithGemini(prompt, context, `blog-${slug}`);
  } catch (error) {
    console.warn('⚠️ getAndUploadBlogImage ignoré:', error.message);
    return null;
  }
}

// Alias conservé pour compatibilité
export const generateAndUploadImage = generateImageWithGemini;
