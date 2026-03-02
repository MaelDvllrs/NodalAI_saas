# 🤖 Déploiement Automatique (CI/CD)

Ce guide explique comment configurer le déploiement automatique de votre SaaS sur chaque push vers la branche `main`.

---

## 🎯 Fonctionnement

Dès que vous pushez du code sur GitHub (branche `main`) :
1. ⚡ **GitHub Actions** détecte le push
2. 🖥️ **Backend** se déploie automatiquement sur votre VPS
3. 🌐 **Frontend** se déploie automatiquement sur Vercel
4. ✅ Notification de succès/échec

**Temps de déploiement** : ~2-3 minutes

---

## 📦 Workflows Créés

3 workflows GitHub Actions ont été créés dans `.github/workflows/` :

### 1. `deploy-backend.yml` 🖥️
- Déclenché quand des fichiers dans `backend/` changent
- Déploie uniquement le backend sur VPS

### 2. `deploy-frontend.yml` 🌐
- Déclenché quand des fichiers dans `frontend/` changent
- Déploie uniquement le frontend sur Vercel

### 3. `deploy-all.yml` 🚀 (Recommandé)
- Déclenché sur tout push vers `main`
- Déploie backend ET frontend en parallèle
- Notifications complètes

---

## 🔧 Configuration Requise

### Étape 1 : Générer une clé SSH pour le VPS

Sur votre machine locale :

```bash
# Générer une nouvelle clé SSH (sans passphrase)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key

# Afficher la clé publique
cat ~/.ssh/github_deploy_key.pub
```

Sur votre VPS :

```bash
# Se connecter au VPS
ssh votre-user@votre-vps-ip

# Ajouter la clé publique aux clés autorisées
echo "VOTRE_CLE_PUBLIQUE_ICI" >> ~/.ssh/authorized_keys

# Vérifier les permissions
chmod 600 ~/.ssh/authorized_keys
```

Tester la connexion :

```bash
# Sur votre machine locale
ssh -i ~/.ssh/github_deploy_key votre-user@votre-vps-ip
```

### Étape 2 : Obtenir les tokens Vercel

1. **Vercel Token** :
   - Allez sur https://vercel.com/account/tokens
   - Créez un nouveau token : **"GitHub Actions Deploy"**
   - Copiez le token (il ne sera affiché qu'une fois)

2. **Vercel Org ID et Project ID** :

```bash
# Dans le dossier frontend
cd frontend

# Se connecter
vercel login

# Lier le projet
vercel link

# Afficher les IDs
cat .vercel/project.json
```

Vous verrez :
```json
{
  "orgId": "team_xxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxx"
}
```

---

## 🔐 Configuration des Secrets GitHub

Sur GitHub, allez dans votre dépôt :

**Settings** > **Secrets and variables** > **Actions** > **New repository secret**

Ajoutez ces secrets :

### Secrets Backend (VPS)

| Secret | Description | Exemple |
|--------|-------------|---------|
| `VPS_SSH_KEY` | Clé SSH privée (contenu de `github_deploy_key`) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `VPS_HOST` | IP ou domaine du VPS | `123.45.67.89` ou `vps.votredomaine.com` |
| `VPS_USER` | Utilisateur SSH | `blogauto` |
| `VPS_PROJECT_PATH` | Chemin du projet sur le VPS | `/home/blogauto/blog-automation` |

### Secrets Frontend (Vercel)

| Secret | Description | Exemple |
|--------|-------------|---------|
| `VERCEL_TOKEN` | Token d'API Vercel | `xxxxx...` |
| `VERCEL_ORG_ID` | ID de l'organisation | `team_xxxxx` |
| `VERCEL_PROJECT_ID` | ID du projet | `prj_xxxxx` |

---

## 📝 Comment Ajouter un Secret

1. Copiez la valeur (clé SSH, token, etc.)
2. Sur GitHub : **Settings** > **Secrets and variables** > **Actions**
3. Cliquez **New repository secret**
4. **Name** : Nom exact du secret (ex: `VPS_SSH_KEY`)
5. **Secret** : Collez la valeur
6. Cliquez **Add secret**

### Copier la clé SSH privée :

```bash
# Sur votre machine locale
cat ~/.ssh/github_deploy_key

# Copiez TOUT le contenu (y compris les lignes BEGIN et END)
# Sur Windows (PowerShell) :
Get-Content ~/.ssh/github_deploy_key | Set-Clipboard
```

---

## 🚀 Utilisation

### Déploiement Automatique

Tout se fait automatiquement :

```bash
# 1. Faites vos modifications
git add .
git commit -m "feat: nouvelle fonctionnalité"

# 2. Push vers GitHub
git push origin main

# 3. GitHub Actions se déclenche automatiquement
# 4. Consultez l'onglet "Actions" sur GitHub pour suivre le déploiement
```

### Déploiement Manuel

Vous pouvez aussi déclencher un déploiement manuellement :

1. Sur GitHub, allez dans **Actions**
2. Sélectionnez le workflow (ex: "Deploy All")
3. Cliquez **Run workflow**
4. Sélectionnez la branche `main`
5. Cliquez **Run workflow**

---

## 📊 Suivre le Déploiement

### Sur GitHub

1. Allez dans l'onglet **Actions** de votre repo
2. Cliquez sur le workflow en cours
3. Suivez les étapes en temps réel :
   - ✅ : Étape réussie
   - ⏳ : En cours
   - ❌ : Échec

### Logs Détaillés

Cliquez sur chaque étape pour voir les logs complets :
- Backend : logs SSH, npm install, PM2 restart
- Frontend : logs build, déploiement Vercel

---

## 🔍 Vérifications Post-Déploiement

### Backend (VPS)

```bash
# Se connecter au VPS
ssh votre-user@votre-vps-ip

# Vérifier PM2
pm2 status blog-backend
pm2 logs blog-backend --lines 50

# Vérifier Nginx
sudo systemctl status nginx

# Test API
curl https://api.votre-domaine.com/health
```

### Frontend (Vercel)

```bash
# Test du site
curl -I https://votre-domaine.vercel.app

# Vérifier sur le dashboard
# https://vercel.com/dashboard
```

---

## 🐛 Dépannage

### ❌ Backend : Erreur SSH

**Problème** : `Permission denied (publickey)`

**Solution** :
1. Vérifiez que la clé SSH privée complète est dans `VPS_SSH_KEY`
2. Vérifiez que la clé publique est dans `~/.ssh/authorized_keys` sur le VPS
3. Vérifiez les permissions : `chmod 600 ~/.ssh/authorized_keys`

### ❌ Backend : Git Pull Failed

**Problème** : `fatal: not a git repository`

**Solution** :
```bash
# Sur le VPS
cd /home/blogauto/blog-automation
git init
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git fetch
git reset --hard origin/main
```

### ❌ Frontend : Vercel Token Invalid

**Problème** : `Error: Invalid token`

**Solution** :
1. Régénérez un token sur https://vercel.com/account/tokens
2. Mettez à jour le secret `VERCEL_TOKEN` sur GitHub
3. Relancez le workflow

### ❌ PM2 : App Not Found

**Problème** : `[PM2][ERROR] App blog-backend not found`

**Solution** :
```bash
# Sur le VPS, démarrer l'app une première fois manuellement
cd ~/blog-automation/backend
pm2 start ecosystem.config.js
pm2 save
```

### ❌ Workflow Failed

**Causes communes** :
- Secret manquant ou mal nommé
- VPS inaccessible (firewall, IP changée)
- Erreur dans le code (tests qui échouent)

**Vérifier** :
1. Onglet **Actions** > Cliquez sur le workflow raté
2. Lisez les logs de l'étape qui a échoué (en rouge)
3. Corrigez le problème
4. Relancez manuellement ou re-pushez

---

## 🎨 Personnalisation

### Déployer Uniquement le Backend

Si vous ne voulez déployer que le backend :

```bash
# Modifiez uniquement des fichiers backend
git add backend/
git commit -m "fix(backend): correction bug"
git push origin main

# Le workflow deploy-backend.yml se déclenchera seul
```

### Déployer Uniquement le Frontend

```bash
# Modifiez uniquement des fichiers frontend
git add frontend/
git commit -m "feat(frontend): nouveau composant"
git push origin main

# Le workflow deploy-frontend.yml se déclenchera seul
```

### Désactiver le Déploiement Auto

Pour désactiver temporairement :

1. **GitHub** > **Actions** > **Disable workflow**
2. Ou commentez les lignes `on: push:` dans les fichiers `.yml`

---

## 🔒 Sécurité

### Bonnes Pratiques

✅ **Utilisez une clé SSH dédiée** (pas votre clé personnelle)
✅ **Limitez les permissions** de l'utilisateur VPS
✅ **Tokens Vercel** : scope limité au projet
✅ **Secrets GitHub** : ne jamais les commiter
✅ **Logs GitHub Actions** : ne pas afficher de secrets

### Rotation des Secrets

Renouvelez régulièrement :
- Clé SSH : tous les 6 mois
- Token Vercel : tous les 3-6 mois

---

## 📈 Amélioration Continue

### Ajouter des Tests (Optionnel)

Créez `.github/workflows/tests.yml` :

```yaml
name: 🧪 Tests

on: [push, pull_request]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - working-directory: ./backend
        run: |
          npm install
          npm test
  
  test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - working-directory: ./frontend
        run: |
          npm install
          npm test
```

### Notifications (Optionnel)

Ajoutez des notifications Slack/Discord :

```yaml
- name: 📧 Notify Success
  if: success()
  uses: 8398a7/action-slack@v3
  with:
    status: success
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## ✅ Checklist de Configuration

Configuration initiale (une seule fois) :

- [ ] Générer clé SSH pour GitHub Actions
- [ ] Ajouter la clé publique sur le VPS
- [ ] Obtenir le token Vercel
- [ ] Obtenir les IDs Vercel (org + project)
- [ ] Ajouter tous les secrets sur GitHub
- [ ] Tester la connexion SSH manuellement
- [ ] Pousser les workflows sur GitHub
- [ ] Tester un déploiement manuel
- [ ] Vérifier que les déploiements automatiques fonctionnent

---

## 🎉 C'est Prêt !

Maintenant, à chaque `git push origin main` :

1. ⚡ GitHub Actions démarre automatiquement
2. 🖥️ Backend se déploie sur le VPS
3. 🌐 Frontend se déploie sur Vercel
4. ✅ Vous recevez une notification de succès

**Plus besoin de déployer manuellement !** 🚀

---

## 📚 Ressources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vercel CLI Documentation](https://vercel.com/docs/cli)
- [PM2 Documentation](https://pm2.keymetrics.io/)
- [SSH Key Management](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)

---

**État actuel** : 🤖 Déploiement automatique configuré !
