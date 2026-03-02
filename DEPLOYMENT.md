# 🚀 Guide de Déploiement en Production

Ce guide vous accompagne pour déployer votre SaaS :
- **Frontend** sur Vercel (gratuit, simple, rapide)
- **Backend** sur un VPS (recommandé : DigitalOcean, Hetzner, ou OVH)

---

## 📋 Prérequis

### Ce dont vous avez besoin :
- ✅ Un compte [Vercel](https://vercel.com) (gratuit)
- ✅ Un VPS Linux (Ubuntu 22.04 recommandé)
- ✅ Un nom de domaine (ex: `votresite.com`)
- ✅ Accès SSH à votre VPS
- ✅ Vos clés API (Supabase, Claude, DataForSEO, Gemini, Webflow)

---

## 🖥️ PARTIE 1 : Déploiement du Backend sur VPS

### Étape 1 : Préparer le VPS

#### 1.1 Se connecter au VPS
```bash
ssh root@votre-ip-vps
```

#### 1.2 Mettre à jour le système
```bash
apt update && apt upgrade -y
```

#### 1.3 Installer Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v  # Vérifier : devrait afficher v20.x
```

#### 1.4 Installer PM2 (gestionnaire de process)
```bash
npm install -g pm2
```

#### 1.5 Installer Nginx (reverse proxy)
```bash
apt install -y nginx
```

---

### Étape 2 : Déployer le Code Backend

#### 2.1 Créer un utilisateur dédié
```bash
adduser blogauto
usermod -aG sudo blogauto
su - blogauto
```

#### 2.2 Cloner le projet
```bash
cd ~
git clone votre-repo-git.git blog-automation
cd blog-automation/backend
```

**OU** si pas de Git, uploader via SFTP dans `/home/blogauto/blog-automation/backend`

#### 2.3 Installer les dépendances
```bash
npm install --production
```

#### 2.4 Configurer les variables d'environnement
```bash
nano .env
```

Ajoutez toutes vos variables :
```env
# Port
PORT=3001

# Supabase
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_SERVICE_KEY=votre-service-key
SUPABASE_ANON_KEY=votre-anon-key
SUPABASE_STORAGE_BUCKET=blog-images

# Claude API
ANTHROPIC_API_KEY=sk-ant-xxxxx

# DataForSEO
DATAFORSEO_LOGIN=votre-login
DATAFORSEO_PASSWORD=votre-password

# Gemini API
GEMINI_API_KEY=votre-gemini-key

# JWT Secret (générez-en un nouveau !)
JWT_SECRET=votre-secret-super-securise-aleatoire

# CORS (votre domaine frontend)
CORS_ORIGIN=https://votre-domaine.vercel.app
```

**Important** : Générez un JWT_SECRET sécurisé :
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2.5 Tester le backend
```bash
npm start
```

Si ça fonctionne (pas d'erreur), arrêtez avec `Ctrl+C`.

---

### Étape 3 : Configurer PM2

#### 3.1 Créer un fichier ecosystem
```bash
nano ecosystem.config.js
```

Contenu :
```javascript
module.exports = {
  apps: [{
    name: 'blog-backend',
    script: './src/server.js',
    instances: 1,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    time: true,
    max_memory_restart: '500M'
  }]
};
```

#### 3.2 Créer le dossier logs
```bash
mkdir -p logs
```

#### 3.3 Démarrer avec PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

**Copiez et exécutez la commande** affichée par `pm2 startup`.

#### 3.4 Vérifier que ça tourne
```bash
pm2 status
pm2 logs blog-backend
```

---

### Étape 4 : Configurer Nginx

#### 4.1 Créer la configuration Nginx
```bash
sudo nano /etc/nginx/sites-available/blog-backend
```

Contenu :
```nginx
server {
    listen 80;
    server_name api.votre-domaine.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Pour les SSE (Server-Sent Events)
        proxy_buffering off;
        proxy_read_timeout 86400s;
    }
}
```

#### 4.2 Activer le site
```bash
sudo ln -s /etc/nginx/sites-available/blog-backend /etc/nginx/sites-enabled/
sudo nginx -t  # Tester la config
sudo systemctl restart nginx
```

#### 4.3 Ouvrir le firewall
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

---

### Étape 5 : Configurer le SSL (HTTPS)

#### 5.1 Pointer votre domaine
Dans votre registrar de domaine, créez un enregistrement DNS :
- **Type** : A
- **Nom** : api (ou autre sous-domaine)
- **Valeur** : IP de votre VPS
- **TTL** : 3600

Attendez que le DNS se propage (5-30 minutes).

#### 5.2 Installer Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

#### 5.3 Obtenir le certificat SSL
```bash
sudo certbot --nginx -d api.votre-domaine.com
```

Suivez les instructions :
- Entrez votre email
- Acceptez les conditions
- Choisissez de rediriger HTTP vers HTTPS (option 2)

#### 5.4 Renouvellement automatique
Certbot configure automatiquement le renouvellement. Vérifiez :
```bash
sudo certbot renew --dry-run
```

---

### Étape 6 : Maintenance du Backend

#### Commandes utiles PM2
```bash
pm2 status              # Voir l'état
pm2 logs blog-backend   # Voir les logs en direct
pm2 restart blog-backend # Redémarrer
pm2 stop blog-backend   # Arrêter
pm2 delete blog-backend # Supprimer
```

#### Mettre à jour le code
```bash
cd ~/blog-automation/backend
git pull origin main
npm install --production
pm2 restart blog-backend
```

#### Monitoring
```bash
pm2 monit  # Interface de monitoring en temps réel
```

---

## 🌐 PARTIE 2 : Déploiement du Frontend sur Vercel

### Étape 1 : Préparer le Projet

#### 1.1 Mettre à jour l'URL de l'API
Dans `frontend/src/app/generate/page.tsx` et autres fichiers utilisant l'API :

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.votre-domaine.com/api';
```

Faites de même pour tous les fichiers qui utilisent `localhost:3001`.

#### 1.2 Créer/vérifier le fichier `.env.local`
```bash
cd frontend
```

Créez `.env.local` :
```env
NEXT_PUBLIC_API_URL=https://api.votre-domaine.com/api
```

#### 1.3 Tester en local
```bash
npm run build
npm start
```

Vérifiez que tout fonctionne avec l'API distante.

---

### Étape 2 : Déployer sur Vercel

#### 2.1 Installer Vercel CLI
```bash
npm install -g vercel
```

#### 2.2 Se connecter
```bash
vercel login
```

#### 2.3 Déployer
```bash
cd frontend
vercel
```

Suivez les instructions :
- **Setup and deploy** : Yes
- **Which scope** : Votre compte personnel
- **Link to existing project** : No
- **Project name** : blog-automation-frontend (ou autre)
- **In which directory is your code** : ./
- **Override settings** : No

#### 2.4 Ajouter les variables d'environnement
Sur le dashboard Vercel (https://vercel.com/dashboard) :

1. Sélectionnez votre projet
2. Allez dans **Settings** > **Environment Variables**
3. Ajoutez :
   - **Name** : `NEXT_PUBLIC_API_URL`
   - **Value** : `https://api.votre-domaine.com/api`
   - **Environment** : Production, Preview, Development

#### 2.5 Redéployer avec les variables
```bash
vercel --prod
```

---

### Étape 3 : Configurer le Domaine Custom (optionnel)

#### 3.1 Dans Vercel
1. Allez dans **Settings** > **Domains**
2. Cliquez sur **Add**
3. Entrez votre domaine : `app.votre-domaine.com`

#### 3.2 Dans votre DNS
Ajoutez un enregistrement CNAME :
- **Type** : CNAME
- **Nom** : app
- **Valeur** : cname.vercel-dns.com
- **TTL** : 3600

Attendez quelques minutes, Vercel configurera automatiquement le SSL.

---

### Étape 4 : Protection contre l'Indexation (Non-Indexation par Google)

⚠️ **Important** : Le frontend est configuré pour **ne pas être indexé** par les moteurs de recherche.

#### Protections mises en place :

1. **Meta tags dans le layout** (`layout.tsx`)
   - `noindex, nofollow` sur toutes les pages
   - Configuration spécifique pour Googlebot

2. **Fichier robots.txt** (`public/robots.txt`)
   - Interdit tous les moteurs de recherche
   - Disallow: / pour tous les user-agents

3. **Génération dynamique de robots.txt** (`robots.ts`)
   - Configuration Next.js pour robots.txt

4. **Headers HTTP via Vercel** (`vercel.json`)
   - `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`

#### Pour activer l'indexation plus tard :

Quand vous serez prêt à rendre le site public :

1. Supprimez le fichier `frontend/vercel.json`
2. Modifiez `frontend/src/app/layout.tsx` :
```typescript
export const metadata: Metadata = {
  title: 'Blog Automation',
  description: 'Génération automatique d\'articles SEO',
  robots: {
    index: true,  // Changez à true
    follow: true, // Changez à true
  },
};
```

3. Modifiez `frontend/src/app/robots.ts` :
```typescript
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',     // Changez disallow en allow
    },
  };
}
```

4. Redéployez sur Vercel :
```bash
vercel --prod
```

---

## 🔒 PARTIE 3 : Sécurité

### Backend VPS

#### 1. Changer le port SSH par défaut
```bash
sudo nano /etc/ssh/sshd_config
```

Modifier :
```
Port 2222  # Au lieu de 22
```

```bash
sudo systemctl restart sshd
sudo ufw allow 2222
```

#### 2. Désactiver le login root
```bash
sudo nano /etc/ssh/sshd_config
```

Modifier :
```
PermitRootLogin no
```

```bash
sudo systemctl restart sshd
```

#### 3. Installer Fail2Ban (protection brute force)
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

#### 4. Mettre à jour régulièrement
```bash
sudo apt update && sudo apt upgrade -y
```

Configurez des mises à jour automatiques :
```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

---

## 📊 PARTIE 4 : Monitoring et Logs

### Backend

#### Logs PM2
```bash
pm2 logs blog-backend --lines 100
```

#### Logs Nginx
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Frontend (Vercel)

1. Dashboard Vercel : https://vercel.com/dashboard
2. Sélectionnez votre projet
3. Onglet **Deployments** : voir tous les déploiements
4. Onglet **Analytics** : voir les statistiques (gratuit avec limitations)

---

## 🔄 PARTIE 5 : Workflow de Mise à Jour

### Mettre à jour le Backend

```bash
# Sur votre machine locale
git add .
git commit -m "Update backend"
git push origin main

# Sur le VPS
ssh blogauto@votre-ip-vps
cd ~/blog-automation/backend
git pull origin main
npm install --production
pm2 restart blog-backend
```

### Mettre à jour le Frontend

```bash
# Sur votre machine locale
cd frontend
git add .
git commit -m "Update frontend"
git push origin main

# Automatique via Vercel Git Integration
# OU manuellement :
vercel --prod
```

#### Activer le déploiement automatique Vercel

1. Dashboard Vercel > **Settings** > **Git**
2. Connectez votre repo GitHub/GitLab
3. Chaque push sur `main` déclenchera un déploiement automatique

---

## 🧪 PARTIE 6 : Tests de Production

### 1. Vérifier le Backend

```bash
# Healthcheck
curl https://api.votre-domaine.com/

# Test login
curl -X POST https://api.votre-domaine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'
```

### 2. Vérifier le Frontend

1. Ouvrez `https://votre-domaine.vercel.app`
2. Créez un compte
3. Ajoutez un site
4. Lancez une génération
5. Vérifiez que tout fonctionne

### 3. Vérifier le CORS

Assurez-vous que dans votre `.env` backend :
```env
CORS_ORIGIN=https://votre-domaine.vercel.app
```

Si vous avez plusieurs domaines (Vercel + custom) :
```env
CORS_ORIGIN=https://votre-domaine.vercel.app,https://app.votre-domaine.com
```

---

## 📈 PARTIE 7 : Optimisations

### Backend

#### 1. Activer la compression
```bash
sudo nano /etc/nginx/sites-available/blog-backend
```

Ajoutez dans le bloc `server` :
```nginx
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

```bash
sudo nginx -t
sudo systemctl restart nginx
```

#### 2. Limiter le rate limiting (protection DDoS)
```bash
sudo nano /etc/nginx/nginx.conf
```

Ajoutez dans le bloc `http` :
```nginx
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
```

Puis dans votre site :
```nginx
location /api/ {
    limit_req zone=api_limit burst=20;
    # ... reste de la config
}
```

### Frontend (Vercel)

Vercel optimise automatiquement :
- ✅ CDN global
- ✅ Compression Brotli/Gzip
- ✅ Cache intelligent
- ✅ Image optimization

---

## 💰 Estimation des Coûts

### VPS (Backend)
- **Hetzner** : 4€/mois (2 vCPU, 4GB RAM) ⭐ Recommandé
- **DigitalOcean** : 6$/mois (1 vCPU, 1GB RAM)
- **OVH** : 7€/mois (2 vCPU, 2GB RAM)

### Vercel (Frontend)
- **Hobby** : Gratuit (100GB bandwidth/mois) ⭐ Suffisant pour commencer
- **Pro** : 20$/mois (1TB bandwidth/mois) - Si besoin de plus

### Supabase
- **Free** : Gratuit (500MB storage, 2GB bandwidth) ⭐ OK pour commencer
- **Pro** : 25$/mois (8GB storage, 50GB bandwidth)

### Domaine
- **.com** : ~10-15€/an

**Total minimum mensuel** : ~5-10€ + coûts API (Claude, DataForSEO, etc.)

---

## 🆘 Troubleshooting

### Backend ne démarre pas
```bash
pm2 logs blog-backend  # Voir les erreurs
pm2 restart blog-backend
```

### Erreur 502 Bad Gateway (Nginx)
```bash
# Vérifier que le backend tourne
pm2 status

# Vérifier les logs Nginx
sudo tail -f /var/log/nginx/error.log
```

### Frontend ne se connecte pas au backend
1. Vérifiez `NEXT_PUBLIC_API_URL` dans Vercel
2. Vérifiez `CORS_ORIGIN` dans le backend
3. Vérifiez que le SSL est actif (https://)

### Certificat SSL expiré
```bash
sudo certbot renew
sudo systemctl restart nginx
```

---

## 📞 Support

- **Backend** : Vérifiez les logs PM2 et Nginx
- **Frontend** : Vérifiez la console Vercel
- **Supabase** : Dashboard Supabase > Logs

---

## ✅ Checklist de Déploiement

### Avant de déployer
- [ ] Toutes les clés API sont prêtes
- [ ] Supabase configuré avec les tables
- [ ] Domaine acheté et DNS configurables
- [ ] VPS accessible en SSH

### Backend
- [ ] Node.js 20 installé
- [ ] Code déployé sur VPS
- [ ] `.env` configuré avec toutes les variables
- [ ] PM2 configuré et démarré
- [ ] Nginx configuré
- [ ] SSL/HTTPS activé
- [ ] Firewall configuré
- [ ] Tests API réussis

### Frontend
- [ ] `NEXT_PUBLIC_API_URL` mis à jour
- [ ] Build local réussi
- [ ] Déployé sur Vercel
- [ ] Variables d'environnement configurées
- [ ] Tests utilisateur réussis

### Sécurité
- [ ] Mots de passe forts partout
- [ ] JWT_SECRET généré aléatoirement
- [ ] Fail2Ban installé
- [ ] SSH sécurisé
- [ ] Firewall actif

---

**Félicitations ! Votre SaaS est maintenant en production ! 🎉**

Pour toute question, consultez les logs et les documentations officielles de chaque service.
