# ✅ Checklist de Déploiement

## 📋 Préparation (À faire avant de commencer)

- [ ] Compte Vercel créé (https://vercel.com)
- [ ] VPS acheté et accessible (Ubuntu 22.04 recommandé)
- [ ] Nom de domaine acheté
- [ ] Accès aux paramètres DNS du domaine
- [ ] Toutes les clés API prêtes :
  - [ ] Supabase (URL + Service Key + Anon Key)
  - [ ] Claude/Anthropic API Key
  - [ ] DataForSEO (Login + Password)
  - [ ] Gemini API Key

---

## 🖥️ Backend (Sur VPS)

### Connexion et Setup Initial
- [ ] Connexion SSH au VPS réussie
- [ ] Système mis à jour (`apt update && apt upgrade`)
- [ ] Node.js 20 installé
- [ ] PM2 installé globalement
- [ ] Nginx installé
- [ ] Utilisateur dédié créé (`blogauto`)

### Déploiement du Code
- [ ] Code backend uploadé/cloné sur le VPS
- [ ] Dépendances installées (`npm install --production`)
- [ ] Fichier `.env` créé avec toutes les variables
- [ ] JWT_SECRET généré aléatoirement
- [ ] Dossier `logs` créé
- [ ] Test manuel réussi (`npm start`)

### Configuration PM2
- [ ] Fichier `ecosystem.config.js` vérifié
- [ ] PM2 démarré (`pm2 start ecosystem.config.js`)
- [ ] PM2 sauvegardé (`pm2 save`)
- [ ] Startup configuré (`pm2 startup`)
- [ ] Commande startup exécutée
- [ ] Status PM2 OK (`pm2 status`)

### Configuration Nginx
- [ ] Fichier nginx créé dans `/etc/nginx/sites-available/`
- [ ] Domaine API configuré (ex: api.votre-domaine.com)
- [ ] Lien symbolique créé dans `sites-enabled`
- [ ] Configuration testée (`nginx -t`)
- [ ] Nginx redémarré
- [ ] Firewall configuré (UFW)

### DNS
- [ ] Enregistrement DNS A créé pour `api.votre-domaine.com`
- [ ] DNS propagé (test avec `nslookup api.votre-domaine.com`)

### SSL/HTTPS
- [ ] Certbot installé
- [ ] Certificat SSL obtenu (`certbot --nginx`)
- [ ] Redirection HTTP → HTTPS activée
- [ ] Test de renouvellement réussi (`certbot renew --dry-run`)

### Sécurité VPS
- [ ] Port SSH changé (optionnel mais recommandé)
- [ ] Login root désactivé
- [ ] Fail2Ban installé et actif
- [ ] Mises à jour automatiques configurées

### Tests Backend
- [ ] `curl https://api.votre-domaine.com/` retourne une réponse
- [ ] Test login API réussi
- [ ] Logs PM2 sans erreurs critiques
- [ ] Logs Nginx propres

---

## 🌐 Frontend (Sur Vercel)

### Préparation du Code
- [ ] Variable `API_URL` mise à jour avec le domaine de prod
- [ ] Fichier `.env.production` créé
- [ ] Build local réussi (`npm run build`)
- [ ] Test local avec API prod réussi (`npm start`)

### Déploiement Vercel
- [ ] Vercel CLI installé (`npm install -g vercel`)
- [ ] Connexion Vercel réussie (`vercel login`)
- [ ] Premier déploiement réussi (`vercel`)
- [ ] Variables d'environnement ajoutées sur Vercel :
  - [ ] `NEXT_PUBLIC_API_URL` configurée
- [ ] Déploiement production réussi (`vercel --prod`)

### Configuration Domaine Frontend (Optionnel)
- [ ] Domaine custom ajouté dans Vercel
- [ ] Enregistrement DNS CNAME créé
- [ ] SSL automatique configuré par Vercel

### Tests Frontend
- [ ] Frontend accessible sur l'URL Vercel
- [ ] Création de compte fonctionne
- [ ] Connexion fonctionne
- [ ] Ajout d'un site fonctionne
- [ ] Génération d'article fonctionne
- [ ] Pas d'erreurs CORS dans la console

### Protection Non-Indexation 🔒
- [ ] `curl -I https://votre-domaine.vercel.app` affiche `X-Robots-Tag: noindex`
- [ ] `https://votre-domaine.vercel.app/robots.txt` affiche `Disallow: /`
- [ ] Code source de la page contient `<meta name="robots" content="noindex, nofollow">`
- [ ] Fichiers présents : `vercel.json`, `robots.ts`, `public/robots.txt`

---

## 🔗 Configuration Finale

### CORS Backend
- [ ] `CORS_ORIGIN` dans `.env` contient l'URL Vercel
- [ ] Si domaine custom, ajouté aussi dans `CORS_ORIGIN`
- [ ] PM2 redémarré après modification

### Tests de Bout en Bout
- [ ] Inscription d'un nouvel utilisateur OK
- [ ] Login OK
- [ ] Ajout d'un site OK
- [ ] Génération complète d'un article OK
- [ ] Article publié sur Webflow OK
- [ ] Image générée et uploadée OK
- [ ] SSE (logs en temps réel) fonctionnent OK

---

## 📊 Monitoring

### Backend
- [ ] Commande `pm2 monit` fonctionne
- [ ] Logs accessibles (`pm2 logs`)
- [ ] Dashboard PM2 exploré

### Frontend
- [ ] Dashboard Vercel accessible
- [ ] Deployments visibles
- [ ] Logs de build consultables

---

## 📖 Documentation

- [ ] [DEPLOYMENT.md](./DEPLOYMENT.md) lu et compris
- [ ] Variables d'environnement documentées
- [ ] Procédure de mise à jour notée
- [ ] Accès VPS et credentials sauvegardés en sécurité

---

## 🚀 Post-Déploiement

### Communication
- [ ] URL de production partagée avec les utilisateurs
- [ ] Documentation utilisateur créée (si besoin)

### Monitoring Continu
- [ ] Alerte configurée pour le downtime (optionnel)
- [ ] Backup de la base Supabase configuré
- [ ] Calendrier de mises à jour défini

---

## 🆘 En Cas de Problème

### Backend ne répond pas
1. Vérifier PM2 : `pm2 status`
2. Vérifier les logs : `pm2 logs blog-backend`
3. Vérifier Nginx : `sudo systemctl status nginx`
4. Vérifier les logs Nginx : `sudo tail -f /var/log/nginx/error.log`

### Frontend ne se connecte pas
1. Vérifier la console navigateur (F12)
2. Vérifier `NEXT_PUBLIC_API_URL` dans Vercel
3. Vérifier les logs de déploiement Vercel
4. Vérifier CORS dans le backend

### Erreur 502 Bad Gateway
1. Backend probablement down : `pm2 restart blog-backend`
2. Vérifier que le port 3001 est libre : `sudo netstat -tlnp | grep 3001`

---

## 🤖 CI/CD - Déploiement Automatique (Optionnel)

### Configuration GitHub Actions
- [ ] Clé SSH dédiée générée pour GitHub Actions
- [ ] Clé publique SSH ajoutée sur le VPS
- [ ] Token Vercel obtenu
- [ ] Vercel Org ID et Project ID obtenus
- [ ] Secrets ajoutés sur GitHub :
  - [ ] `VPS_SSH_KEY`
  - [ ] `VPS_HOST`
  - [ ] `VPS_USER`
  - [ ] `VPS_PROJECT_PATH`
  - [ ] `VERCEL_TOKEN`
  - [ ] `VERCEL_ORG_ID`
  - [ ] `VERCEL_PROJECT_ID`

### Tests CI/CD
- [ ] Workflows GitHub Actions committés (`.github/workflows/`)
- [ ] Test de connexion SSH manuel réussi
- [ ] Premier déploiement manuel via GitHub Actions réussi
- [ ] Push test sur `main` déclenche le déploiement auto
- [ ] Backend se déploie correctement
- [ ] Frontend se déploie correctement
- [ ] Notifications de succès/échec fonctionnent

---

**Date de déploiement** : ___________

**État** : ✅ Production / 🔄 En cours / ❌ En attente

**CI/CD** : 🤖 Activé / ❌ Désactivé / ⏳ En configuration

**Notes** :
```
Ajoutez ici vos notes personnelles, URLs importantes, etc.
```
