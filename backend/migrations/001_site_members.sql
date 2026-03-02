-- ============================================================
-- Migration: Système multi-utilisateurs par site (site_members)
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

-- Création de la table des membres d'un site
CREATE TABLE IF NOT EXISTS site_members (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     UUID        NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT      NOT NULL,           -- toujours renseigné (même si l'user existe déjà)
  role        TEXT        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('admin', 'member')),
  status      TEXT        NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active', 'pending')),
  invited_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),

  -- Un utilisateur ne peut apparaître qu'une fois par site
  CONSTRAINT site_members_unique_user  UNIQUE (site_id, user_id),
  -- Un email en attente ne peut apparaître qu'une fois par site
  CONSTRAINT site_members_unique_email UNIQUE (site_id, invited_email)
);

-- Index pour les lookups courants
CREATE INDEX IF NOT EXISTS idx_site_members_site_id   ON site_members(site_id);
CREATE INDEX IF NOT EXISTS idx_site_members_user_id   ON site_members(user_id);
CREATE INDEX IF NOT EXISTS idx_site_members_email     ON site_members(invited_email);
CREATE INDEX IF NOT EXISTS idx_site_members_status    ON site_members(status);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================
ALTER TABLE site_members ENABLE ROW LEVEL SECURITY;

-- Lecture : un utilisateur peut voir les membres d'un site
--   s'il en est le propriétaire OU s'il est lui-même membre actif
CREATE POLICY "site_members_select" ON site_members
  FOR SELECT USING (
    site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
    OR (user_id = auth.uid() AND status = 'active')
  );

-- Écriture : seuls le propriétaire du site ou un admin membre peuvent gérer les membres.
-- (Le service backend utilise la clé SERVICE_KEY qui bypasse RLS, donc cette policy
--  sert surtout de garde-fou supplémentaire au niveau BDD.)
CREATE POLICY "site_members_insert" ON site_members
  FOR INSERT WITH CHECK (
    site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
    OR site_id IN (
      SELECT sm.site_id FROM site_members sm
      WHERE sm.user_id = auth.uid() AND sm.role = 'admin' AND sm.status = 'active'
    )
  );

CREATE POLICY "site_members_delete" ON site_members
  FOR DELETE USING (
    site_id IN (
      SELECT id FROM sites WHERE user_id = auth.uid()
    )
    OR site_id IN (
      SELECT sm.site_id FROM site_members sm
      WHERE sm.user_id = auth.uid() AND sm.role = 'admin' AND sm.status = 'active'
    )
  );

-- ============================================================
-- Vérification : afficher la structure créée
-- ============================================================
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'site_members'
ORDER BY ordinal_position;
