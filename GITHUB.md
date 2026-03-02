# 📦 Préparer le Projet pour GitHub

## ✅ Fichiers Sensibles Protégés

Les fichiers `.gitignore` ont été configurés pour protéger :

### 🔒 Informations Sensibles (JAMAIS commitées)
- ✅ `.env` et toutes ses variantes
- ✅ Clés API et secrets
- ✅ Certificats SSL (*.pem, *.key, *.crt)
- ✅ Credentials Supabase
- ✅ Tokens JWT

### 📦 Fichiers Build/Dépendances
- ✅ `node_modules/`
- ✅ `dist/`, `build/`, `out/`
- ✅ `.next/` (Next.js)
- ✅ Logs PM2

### 💻 Fichiers Système/IDE
- ✅ `.DS_Store`, `Thumbs.db`
- ✅ `.vscode/`, `.idea/`
- ✅ Fichiers temporaires

---

## 🚀 Publier sur GitHub

### 1. Vérifier les fichiers sensibles

Avant de publier, **vérifiez** qu'aucun fichier sensible n'est présent :

```bash
# Rechercher les fichiers .env
git status | grep -i "\.env"

# Lister tous les fichiers qui seront commités
git add --dry-run .
```

### 2. Créer un dépôt GitHub

Sur [github.com](https://github.com) :
1. Cliquez sur **New Repository**
2. Nom : `automatisation-blog` (ou autre)
3. Description : "SaaS de génération automatique d'articles SEO avec IA"
4. **Privé** ou Public (recommandé : Privé pour commencer)
5. **NE PAS** initialiser avec README (votre projet en a déjà un)
6. Cliquez sur **Create Repository**

### 3. Initialiser Git localement

```powershell
# A la racine du projet
cd D:\Mael\wenbole\automatisation_blog

# Initialiser Git si pas déjà fait
git init

# Vérifier que .gitignore fonctionne
git status

# Ajouter tous les fichiers (sauf ceux dans .gitignore)
git add .

# Premier commit
git commit -m "Initial commit: SaaS Blog Automation"

# Ajouter le remote GitHub (remplacez YOUR_USERNAME et YOUR_REPO)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Pousser vers GitHub
git branch -M main
git push -u origin main
```

### 4. Configurer les Secrets GitHub (pour CI/CD futur)

Si vous voulez automatiser le déploiement via GitHub Actions plus tard :

1. Sur GitHub, allez dans **Settings** > **Secrets and variables** > **Actions**
2. Ajoutez vos secrets :
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
   - `ANTHROPIC_API_KEY`
   - `DATAFORSEO_LOGIN`
   - `DATAFORSEO_PASSWORD`
   - `GEMINI_API_KEY`
   - `JWT_SECRET`

---

## 📋 Checklist Avant Push

- [ ] `.gitignore` présent à la racine
- [ ] `.env` **n'apparaît PAS** dans `git status`
- [ ] `node_modules/` **n'apparaît PAS** dans `git status`
- [ ] Les fichiers `.env.example` sont présents (templates sans valeurs)
- [ ] README.md à jour avec instructions
- [ ] Aucune clé API dans le code source
- [ ] Aucun mot de passe en dur

---

## 🔍 Vérifier qu'aucun secret n'est exposé

### Avant le push :

```bash
# Rechercher des patterns suspects dans les fichiers tracked
git grep -i "api.key"
git grep -i "password"
git grep -i "secret"
git grep -i "sk-ant-"  # Claude API keys
git grep -i "supabase"
```

Si vous trouvez des secrets, **ne pushez pas** et nettoyez d'abord.

### Après le premier push :

Utilisez un outil comme [GitGuardian](https://www.gitguardian.com/) ou [TruffleHog](https://github.com/trufflesecurity/trufflehog) pour scanner :

```bash
# Installer trufflehog
npm install -g trufflehog

# Scanner le repo
trufflehog filesystem .
```

---

## 🔄 Workflow Git Recommandé

### Développement quotidien :

```bash
# Vérifier les changements
git status

# Ajouter des fichiers spécifiques
git add backend/src/services/blog.service.js
git add frontend/src/app/dashboard/page.tsx

# Ou tout ajouter
git add .

# Commit avec message descriptif
git commit -m "feat: amélioration du service de génération d'images"

# Push vers GitHub
git push origin main
```

### Branches pour nouvelles fonctionnalités :

```bash
# Créer une branche
git checkout -b feature/nouvelle-fonctionnalite

# Développer...
git add .
git commit -m "feat: ajout de la fonctionnalité X"

# Push la branche
git push origin feature/nouvelle-fonctionnalite

# Créer une Pull Request sur GitHub
# Merger après review
```

---

## 🛡️ Si Vous Avez Accidentellement Commité un Secret

### 1. Supprimer du dernier commit (avant push) :

```bash
# Modifier le dernier commit
git reset HEAD~1

# Supprimer le fichier sensible
git rm --cached .env

# Re-commiter
git add .
git commit -m "Initial commit (fixed)"
```

### 2. Si déjà pushé sur GitHub :

⚠️ **URGENT** : Le secret est maintenant public !

1. **Révoquez immédiatement** la clé API compromise
2. Générez une nouvelle clé
3. Nettoyez l'historique Git :

```bash
# Utiliser git-filter-repo (recommandé)
pip install git-filter-repo
git filter-repo --invert-paths --path .env

# Force push (écrase l'historique)
git push origin main --force
```

4. Contactez le support de l'API concernée

---

## 📊 Structure du Repo GitHub

Après le push, votre repo aura cette structure :

```
automatisation_blog/
├── README.md                    ✅ Documentation principale
├── DEPLOYMENT.md                ✅ Guide de déploiement
├── CHECKLIST.md                 ✅ Checklist de déploiement
├── .gitignore                   ✅ Protection des secrets
├── backend/
│   ├── .env.example            ✅ Template (SANS valeurs)
│   ├── .gitignore              ✅ Protection backend
│   ├── package.json            ✅ Dépendances
│   ├── ecosystem.config.js     ✅ Config PM2
│   ├── nginx.conf              ✅ Config Nginx
│   ├── deploy.sh               ✅ Script de déploiement
│   └── src/                    ✅ Code source
└── frontend/
    ├── .env.example            ✅ Template
    ├── .env.production         ✅ Config prod (SANS secrets)
    ├── .gitignore              ✅ Protection frontend
    ├── package.json            ✅ Dépendances
    ├── vercel.json             ✅ Config Vercel
    ├── NO-INDEX.md             ✅ Documentation non-indexation
    └── src/                    ✅ Code source
```

**Note** : Les fichiers `.env` réels ne sont **JAMAIS** sur GitHub.

---

## 🎯 Bonnes Pratiques

### Messages de Commit

Utilisez la convention [Conventional Commits](https://www.conventionalcommits.org/) :

```
feat: ajouter une nouvelle fonctionnalité
fix: corriger un bug
docs: modifier la documentation
style: changements de formatage
refactor: refactoriser le code
test: ajouter des tests
chore: tâches de maintenance
```

Exemples :
```bash
git commit -m "feat(backend): ajouter cache Redis pour les mots-clés"
git commit -m "fix(frontend): corriger erreur CORS sur génération"
git commit -m "docs: mettre à jour le guide de déploiement"
```

### Protection de la Branche Main

Sur GitHub, configurez la protection :

1. **Settings** > **Branches** > **Add rule**
2. Branch name pattern : `main`
3. ✅ Require pull request reviews before merging
4. ✅ Require status checks to pass before merging

---

## ✅ C'est Fait !

Votre projet est maintenant sur GitHub avec toutes les protections nécessaires.

### Prochaines étapes :

1. ✅ Code sécurisé sur GitHub (privé recommandé)
2. 🚀 Suivre [DEPLOYMENT.md](../DEPLOYMENT.md) pour mettre en production
3. 📊 Configurer GitHub Actions pour CI/CD (optionnel)
4. 🔄 Développer de nouvelles fonctionnalités en branches
5. 📈 Partager avec votre équipe (si besoin)

---

**Rappel Important** : Ne partagez **JAMAIS** vos fichiers `.env` ou vos clés API publiquement ! 🔒
