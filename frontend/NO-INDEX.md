# 🔒 Protection contre l'Indexation

## ⚠️ Le site n'est PAS indexable par Google

Le frontend est configuré pour bloquer tous les moteurs de recherche.

---

## 🛡️ Protections Activées

### 1. Meta Tags SEO
**Fichier** : `src/app/layout.tsx`

```typescript
robots: {
  index: false,
  follow: false,
  nocache: true,
}
```

### 2. Fichier robots.txt
**Fichiers** : 
- `public/robots.txt` (statique)
- `src/app/robots.ts` (dynamique)

```txt
User-agent: *
Disallow: /
```

### 3. Headers HTTP
**Fichier** : `vercel.json`

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Robots-Tag",
          "value": "noindex, nofollow, noarchive, nosnippet, noimageindex"
        }
      ]
    }
  ]
}
```

---

## ✅ Vérifications

### Après déploiement, vérifiez :

1. **Headers HTTP** :
```bash
curl -I https://votre-domaine.vercel.app
```

Devrait afficher :
```
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
```

2. **Robots.txt** :
```bash
curl https://votre-domaine.vercel.app/robots.txt
```

Devrait afficher :
```
User-agent: *
Disallow: /
```

3. **Meta tags** :
Ouvrez le site et vérifiez le code source (Ctrl+U), cherchez :
```html
<meta name="robots" content="noindex, nofollow">
```

---

## 🚀 Activer l'Indexation (Quand Prêt)

### Étape 1 : Supprimer les protections

```bash
# Supprimer le fichier vercel.json
rm vercel.json
```

### Étape 2 : Modifier le layout.tsx

```typescript
export const metadata: Metadata = {
  title: 'Blog Automation',
  description: 'Génération automatique d\'articles SEO',
  robots: {
    index: true,      // ✅ Activer l'indexation
    follow: true,     // ✅ Activer le suivi des liens
  },
};
```

### Étape 3 : Modifier robots.ts

```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',      // ✅ Autoriser tous les bots
    },
    sitemap: 'https://votre-domaine.com/sitemap.xml',
  };
}
```

### Étape 4 : Redéployer

```bash
git add .
git commit -m "Activer l'indexation Google"
git push origin main

# OU manuellement :
vercel --prod
```

---

## 📊 Vérifier l'Indexation Google

### Après activation :

1. **Search Console** :
   - Ajoutez votre site sur [Google Search Console](https://search.google.com/search-console)
   - Demandez une indexation manuelle

2. **Opérateur site:** :
```
site:votre-domaine.com
```

3. **URL Inspection Tool** :
   - Testez l'indexabilité d'une URL spécifique

---

## ⚠️ Important

- **En développement** : La protection est active
- **En production** : La protection est active par défaut
- **Quand prêt** : Suivez les étapes ci-dessus pour activer

L'indexation peut prendre de quelques jours à quelques semaines après activation.

---

**État actuel** : 🔒 **NON INDEXABLE** (Protection active)
