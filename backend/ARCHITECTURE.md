# 🏗️ Architecture du Système

## Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (Next.js)                       │
│  ┌────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │  BlogForm  │  │ ProgressLog  │  │  Dashboard   │            │
│  │            │  │              │  │  (nouveau)   │            │
│  └────────────┘  └──────────────┘  └──────────────┘            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/SSE
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js)                        │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Routes & Controllers                   │  │
│  │  ┌────────┐┌────────┐┌────────┐┌─────────┐┌──────────┐ │  │
│  │  │ /auth  ││ /sites ││ /blogs ││/generate││/analytics│ │  │
│  │  └────────┘└────────┘└────────┘└─────────┘└──────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                  Middleware & Logic                       │  │
│  │  ┌─────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │ Auth Check  │  │     Business Logic Services      │  │  │
│  │  │ (JWT)       │  │  • Site Management               │  │  │
│  │  └─────────────┘  │  • Blog Generation               │  │  │
│  │                   │  • Keyword Caching               │  │  │
│  │                   │  • Analytics Processing          │  │  │
│  │                   └──────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   External Services                       │  │
│  │  ┌──────────┐ ┌────────────┐ ┌──────────┐              │  │
│  │  │  Claude  │ │ DataForSEO │ │ Webflow  │              │  │
│  │  │   API    │ │    API     │ │   API    │              │  │
│  │  └──────────┘ └────────────┘ └──────────┘              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SUPABASE (PostgreSQL)                         │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐                  │
│  │  Users   │  │    Sites     │  │  Blogs   │                  │
│  │ (Auth)   │  │              │  │          │                  │
│  └──────────┘  └──────────────┘  └──────────┘                  │
│                                                                  │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐                  │
│  │ Keywords │  │Crawled Pages │  │Analytics │                  │
│  │ (Cache)  │  │              │  │          │                  │
│  └──────────┘  └──────────────┘  └──────────┘                  │
│                                                                  │
│  ┌──────────────────────────────────────────┐                  │
│  │        Row Level Security (RLS)          │                  │
│  │  Chaque utilisateur voit ses données     │                  │
│  └──────────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────┘
```

## Flux de Génération de Blog

### Mode Simple (Sans BDD)
```
User Input
    │
    ├─► DataForSEO API ──► Main Keyword + KD
    │
    ├─► Claude API ──────► Secondary Keywords
    │
    ├─► Sitemap Crawl ───► Internal URLs
    │
    ├─► Claude API ──────► Blog Content
    │
    └─► Webflow API ─────► Published Blog
```

### Mode Optimisé (Avec BDD) ⭐
```
User Input (+ Auth Token + Site ID)
    │
    ├─► 🔍 Check Keyword Cache
    │     ├─ Found ─────► ✅ Use Cached (économie !)
    │     └─ Not Found ─► DataForSEO ──► Save to Cache
    │
    ├─► 🔍 Check Secondary Keywords Cache
    │     ├─ Found ─────► ✅ Use Cached (économie !)
    │     └─ Not Found ─► Claude ──► Save to Cache
    │
    ├─► 💾 Get Crawled Pages from DB
    │     ├─ Found ─────► ✅ Use from DB
    │     └─ Not Found ─► Crawl ──► Save to DB
    │
    ├─► 🤖 Claude API ──► Blog Content
    │
    ├─► 📤 Webflow API ──► Published Blog
    │
    └─► 💾 Save Blog to DB ──► Analytics Ready
```

## Modèle de Données

### Relations Principales

```
┌──────────────┐
│    Users     │
│  (Supabase)  │
└──────┬───────┘
       │
       │ 1:N
       │
┌──────▼───────┐         ┌────────────────┐
│    Sites     │◄───1:N──┤ Crawled Pages  │
└──────┬───────┘         └────────────────┘
       │
       │ 1:N
       │
┌──────▼───────┐         ┌────────────────┐
│    Blogs     │◄───1:N──┤Blog Analytics  │
└──────┬───────┘         └────────────────┘
       │                           │
       │                           │ 1:N
       │                           │
       │                 ┌─────────▼────────┐
       │                 │Successful        │
       │                 │Patterns          │
       │                 └──────────────────┘
       │
       │ N:1
       │
┌──────▼───────┐         ┌────────────────┐
│  Keywords    │◄───1:N──┤Secondary       │
│  (Shared)    │         │Keywords        │
└──────────────┘         └────────────────┘
```

## Sécurité & Permissions

### Row Level Security (RLS)

```
┌─────────────────────────────────────────────────────┐
│                      Policies                        │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Sites:                                             │
│  • SELECT: auth.uid() = user_id                     │
│  • INSERT: auth.uid() = user_id                     │
│  • UPDATE: auth.uid() = user_id                     │
│  • DELETE: auth.uid() = user_id                     │
│                                                      │
│  Blogs:                                             │
│  • SELECT: auth.uid() = user_id                     │
│  • INSERT: auth.uid() = user_id                     │
│  • UPDATE: auth.uid() = user_id                     │
│  • DELETE: auth.uid() = user_id                     │
│                                                      │
│  Crawled Pages:                                     │
│  • Access via Sites (user owns site)                │
│                                                      │
│  Analytics:                                         │
│  • Access via Blogs (user owns blog)                │
│                                                      │
│  Keywords:                                          │
│  • Shared (no RLS)                                  │
│  • Read-only for token economy                      │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Cache & Optimisation

### Économie de Tokens

```
┌──────────────────────────────────────────────┐
│          Without Cache (Before)               │
├──────────────────────────────────────────────┤
│  Blog 1: "SEO pour e-commerce"              │
│  ├─ DataForSEO: 1 credit                    │
│  └─ Claude: ~2000 tokens                    │
│                                              │
│  Blog 2: "SEO pour e-commerce" (again)      │
│  ├─ DataForSEO: 1 credit  ❌ Duplicate!     │
│  └─ Claude: ~2000 tokens  ❌ Duplicate!     │
│                                              │
│  Total: 2 credits + 4000 tokens             │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│           With Cache (After)                  │
├──────────────────────────────────────────────┤
│  Blog 1: "SEO pour e-commerce"              │
│  ├─ DataForSEO: 1 credit → Save to DB      │
│  └─ Claude: ~2000 tokens → Save to DB      │
│                                              │
│  Blog 2: "SEO pour e-commerce" (again)      │
│  ├─ Database: 0 credits  ✅ From cache!     │
│  └─ Database: 0 tokens   ✅ From cache!     │
│                                              │
│  Total: 1 credit + 2000 tokens              │
│  Saved: 50% costs! 💰                        │
└──────────────────────────────────────────────┘
```

## Analytics & Amélioration

### Cycle d'Amélioration Continue

```
    ┌─────────────────┐
    │  Generate Blog  │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  Save to DB     │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Track Analytics │◄─── Google Analytics
    │ • Views         │     Google Search Console
    │ • Clicks        │
    │ • Position      │
    │ • CTR           │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Identify Top    │
    │ Performers      │
    │ (score > 50)    │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Extract         │
    │ Patterns        │
    │ • Tone          │
    │ • Structure     │
    │ • Keywords      │
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │ Apply Patterns  │──┐
    │ to New Blogs    │  │
    └─────────────────┘  │
             │             │
             └─────────────┘
           Continuous Improvement Loop
```

## Points d'Extension Futurs

### 1. Intégration Google Analytics
```javascript
// Récupération automatique des métriques
POST /api/analytics/:blogId/sync-google
→ Fetch data from Google Analytics API
→ Save to blog_analytics table
→ Update patterns automatically
```

### 2. Suggestions IA
```javascript
// Recommandations basées sur les patterns
GET /api/suggestions?theme=SEO
→ Analyze successful_patterns
→ Generate recommendations
→ Return best practices
```

### 3. Génération en Masse
```javascript
// Générer plusieurs blogs d'un coup
POST /api/bulk-generate
{
  "themes": ["theme1", "theme2", ...],
  "siteId": "...",
  "usePatterns": true
}
```

## Technologies Utilisées

| Composant | Technologie | Rôle |
|-----------|-------------|------|
| **Backend** | Express.js | API REST |
| **Database** | Supabase (PostgreSQL) | Stockage et auth |
| **AI Content** | Claude (Anthropic) | Génération de contenu |
| **SEO Data** | DataForSEO | Mots-clés et métriques |
| **CMS** | Webflow API | Publication |
| **Auth** | Supabase Auth | JWT/Session |
| **Security** | RLS (Row Level Security) | Permissions |

## Performances

### Temps de Génération

| Étape | Sans Cache | Avec Cache |
|-------|-----------|------------|
| Keyword Research | 2s | 0.1s ✅ |
| Secondary Keywords | 3s | 0.1s ✅ |
| Crawl Pages | 5s | 0.1s ✅ |
| Generate Content | 30s | 30s |
| Publish to Webflow | 2s | 2s |
| Save to DB | - | 0.5s |
| **Total** | **42s** | **32.8s** ⚡ |

### Économies

- **Tokens Claude** : Jusqu'à 50% d'économie
- **Crédits DataForSEO** : Jusqu'à 70% d'économie
- **Temps** : 22% plus rapide

---

**Architecture conçue pour la scalabilité, la performance et l'amélioration continue** 🚀
