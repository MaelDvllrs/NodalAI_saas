# 🚀 Système d'Automatisation de Blog avec Base de Données

## ✨ Nouvelles Fonctionnalités

Le système a été enrichi avec une **base de données Supabase** qui apporte :

### 🔐 Comptes Utilisateurs
- Authentification sécurisée avec Supabase Auth
- Chaque utilisateur a ses propres sites et blogs
- Row Level Security (RLS) pour la protection des données

### 🌐 Gestion Multi-Sites
- Ajoutez plusieurs sites avec leurs configurations Webflow
- Accès rapide aux paramètres de chaque site
- Historique complet par site

### 💾 Cache Intelligent des Mots-Clés
**Économie de tokens Claude et DataForSEO** :
- Les mots-clés principaux sont mis en cache
- Les mots-clés secondaires sont réutilisés
- Plus besoin de régénérer si déjà utilisés

### 🗺️ Crawling Persistant
- Les URLs crawlées sont sauvegardées en BDD
- Pas besoin de recrawler à chaque génération
- Maillage interne optimisé

### 📊 Analytics et Performance
- Trackez les performances de chaque blog
- Métriques : vues, clics, position Google, CTR, etc.
- Identification automatique des blogs performants

### 🎯 Patterns de Succès
- Analyse automatique des blogs qui performent bien
- Extraction des patterns (ton, structure, mots-clés)
- Amélioration continue basée sur les données

## 📦 Installation

### 1. Installer les dépendances

```bash
cd backend
npm install
```

### 2. Configurer Supabase

Suivez le guide complet dans [DATABASE_SETUP.md](./DATABASE_SETUP.md)

Résumé rapide :
1. Créez un compte sur [supabase.com](https://supabase.com)
2. Créez un nouveau projet
3. Exécutez le script SQL dans `supabase-schema.sql`
4. Ajoutez vos clés Supabase dans `.env`

### 3. Variables d'environnement

Ajoutez ces variables dans votre fichier `.env` :

```env
# Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-service-key
SUPABASE_ANON_KEY=votre-anon-key

# Autres variables existantes...
```

## 🎮 Utilisation

### Mode Compatible (sans authentification)
Le système fonctionne **exactement comme avant** si vous n'envoyez pas de token d'authentification. Aucune fonctionnalité n'est cassée !

### Mode Amélioré (avec authentification)

#### 1. Créer un compte
```bash
POST /api/auth/signup
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

#### 2. Se connecter
```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

Vous recevrez un `accessToken` à utiliser pour toutes les requêtes suivantes.

#### 3. Ajouter un site
```bash
POST /api/sites
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
{
  "name": "Mon Site",
  "url": "https://monsite.com",
  "webflowSiteId": "...",
  "webflowApiKey": "...",
  "webflowCollectionName": "Blog Posts"
}
```

#### 4. Crawler le site
```bash
POST /api/sites/{siteId}/crawl
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
```

#### 5. Générer un blog (avec cache)
```bash
POST /api/generate
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
{
  "siteId": "webflow-site-id",
  "apiKey": "webflow-api-key",
  "collectionName": "Blog Posts",
  "theme": "SEO pour e-commerce",
  "tone": "professionnel",
  "status": "publish",
  "siteUrl": "https://monsite.com",
  "dbSiteId": "uuid-from-database"  // ← Nouveau !
}
```

Le système va automatiquement :
- ✅ Chercher les mots-clés dans le cache
- ✅ Récupérer les URLs internes depuis la BDD
- ✅ Éviter les doublons de titres
- ✅ Sauvegarder le blog généré
- ✅ Économiser vos tokens !

#### 6. Voir vos blogs
```bash
GET /api/blogs
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
```

#### 7. Ajouter des analytics
```bash
POST /api/analytics/{blogId}
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
{
  "date": "2026-02-26",
  "pageViews": 1250,
  "clicks": 45,
  "googlePosition": 3,
  "ctr": 3.6,
  "bounceRate": 42.5
}
```

#### 8. Voir les blogs performants
```bash
GET /api/analytics/site/{siteId}/top-performing?limit=10
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
```

#### 9. Analyser les patterns de succès
```bash
POST /api/analytics/{blogId}/analyze-patterns
Headers: { "Authorization": "Bearer YOUR_TOKEN" }
```

## 🛠️ API Routes

### Authentification
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/signup` | Créer un compte |
| POST | `/api/auth/login` | Se connecter |
| POST | `/api/auth/logout` | Se déconnecter |
| GET | `/api/auth/me` | Info utilisateur |
| POST | `/api/auth/refresh` | Rafraîchir le token |

### Sites
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/sites` | Liste des sites |
| POST | `/api/sites` | Créer un site |
| GET | `/api/sites/:id` | Détails d'un site |
| PUT | `/api/sites/:id` | Modifier un site |
| DELETE | `/api/sites/:id` | Supprimer un site |
| POST | `/api/sites/:id/crawl` | Crawler le site |
| GET | `/api/sites/:id/pages` | Pages crawlées |

### Blogs
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/blogs` | Tous les blogs |
| GET | `/api/blogs/:id` | Détails d'un blog |
| GET | `/api/blogs/site/:siteId` | Blogs d'un site |
| PUT | `/api/blogs/:id` | Modifier un blog |
| DELETE | `/api/blogs/:id` | Supprimer un blog |
| POST | `/api/blogs/:id/publish` | Publier un blog |

### Analytics
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/analytics/:blogId` | Ajouter analytics |
| GET | `/api/analytics/:blogId` | Récupérer analytics |
| GET | `/api/analytics/:blogId/aggregate` | Analytics agrégées |
| GET | `/api/analytics/site/:siteId/top-performing` | Top blogs |
| POST | `/api/analytics/:blogId/analyze-patterns` | Analyser patterns |
| GET | `/api/analytics/site/:siteId/patterns` | Patterns performants |

### Génération (existant, compatible)
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/generate` | Générer un blog |
| GET | `/api/stream/:jobId` | Stream des événements |

## 💡 Avantages

### Économie de Coûts
- **Cache des mots-clés** : Pas de regénération inutile
- **Crawling persistant** : Pas besoin de recrawler
- Réduction significative des appels API

### Amélioration Continue
- **Analytics intégrés** : Suivez ce qui fonctionne
- **Patterns automatiques** : Apprenez de vos succès
- **Optimisation basée sur les données**

### Expérience Utilisateur
- **Multi-sites** : Gérez tous vos projets
- **Historique complet** : Retrouvez tous vos blogs
- **Sécurité** : Vos données sont protégées

## 🔄 Rétrocompatibilité

Le système est **100% rétrocompatible** :
- Sans authentification → Fonctionne comme avant
- Avec authentification → Toutes les nouvelles fonctionnalités

Aucun changement n'est nécessaire pour continuer à utiliser le système existant !

## 📚 Documentation Complète

- [Configuration de la base de données](./DATABASE_SETUP.md)
- [Schéma SQL](./supabase-schema.sql)
- **[� Installation Vues & RLS](./INSTALLATION_RLS_VIEWS.md)** - ⭐ Guide complet d'installation (COMMENCEZ ICI)
- **[🔐 Politiques RLS (Row Level Security)](./RLS_POLICIES_GUIDE.md)** - Guide détaillé des politiques de sécurité
- [📋 RLS Quick Reference](./RLS_QUICK_REFERENCE.md) - Référence rapide des policies
- [💾 Scripts SQL RLS](./supabase-rls-policies.sql) - Script à exécuter dans Supabase
- **[📊 Vues SQL](./supabase-views.sql)** - Définitions des vues blogs_with_analytics et top_performing_blogs

### 🔐 Sécurité RLS

Les politiques Row Level Security sont maintenant configurées pour :
- ✅ **keywords** et **secondary_keywords** - Cache partagé (lecture publique)
- ✅ **successful_patterns** - Accès basé sur la propriété du blog
- ✅ **blogs_with_analytics** et **top_performing_blogs** - Vues sécurisées (héritage RLS automatique)
- ✅ Protection automatique des données utilisateur

**Installation rapide (5 minutes) :**
1. Suivez le guide [INSTALLATION_RLS_VIEWS.md](./INSTALLATION_RLS_VIEWS.md)
2. Exécutez [supabase-views.sql](./supabase-views.sql) dans Supabase SQL Editor
3. Exécutez [supabase-rls-policies.sql](./supabase-rls-policies.sql) dans Supabase SQL Editor
4. Vérifiez avec les tests dans le guide

### 📊 Vues SQL Analytics

Deux vues puissantes pour analyser vos blogs :
- **blogs_with_analytics** - Agrège automatiquement les stats de chaque blog (vues, clics, position, etc.)
- **top_performing_blogs** - Filtre et classe les blogs les plus performants avec un score calculé

Ces vues héritent automatiquement des politiques RLS et ne montrent que les données de l'utilisateur connecté.

## 🌟 Roadmap

### Prochaines fonctionnalités
1. **Intégration Google Analytics** - Import automatique des métriques
2. **Intégration Google Search Console** - Données SEO réelles
3. **Dashboard Analytics** - Visualisations et statistiques
4. **Suggestions IA** - Recommandations basées sur les patterns
5. **API de génération en masse** - Générez plusieurs blogs d'un coup
6. **Planification** - Programmez vos publications
7. **Webhooks** - Notifications automatiques

## 🤝 Support

Pour toute question sur la configuration de la base de données, consultez [DATABASE_SETUP.md](./DATABASE_SETUP.md).

---

**Créé avec ❤️ pour l'automatisation de contenu intelligent**
