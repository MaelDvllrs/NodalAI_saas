#!/bin/bash

# Script de déploiement automatique pour le backend
# Usage: ./deploy.sh

set -e  # Arrêter en cas d'erreur

echo "🚀 Déploiement du backend en cours..."

# Couleurs pour les messages
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Vérifier qu'on est dans le bon dossier
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Erreur: package.json introuvable. Exécutez ce script depuis le dossier backend.${NC}"
    exit 1
fi

# 1. Pull les dernières modifications
echo -e "${BLUE}📥 Récupération des dernières modifications...${NC}"
git pull origin main

# 2. Installer les dépendances
echo -e "${BLUE}📦 Installation des dépendances...${NC}"
npm install --production

# 3. Créer le dossier logs s'il n'existe pas
mkdir -p logs

# 4. Redémarrer PM2
echo -e "${BLUE}🔄 Redémarrage de l'application...${NC}"
pm2 restart blog-backend

# 5. Vérifier le statut
echo -e "${BLUE}✅ Vérification du statut...${NC}"
pm2 status blog-backend

echo -e "${GREEN}✨ Déploiement terminé avec succès !${NC}"
echo ""
echo "Pour voir les logs en direct:"
echo -e "${BLUE}pm2 logs blog-backend${NC}"
