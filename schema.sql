-- ============================================================
-- SCHEMA SQL POUR L'APPLICATION DE PROSPECTION MSI
-- À coller dans Supabase, onglet "SQL Editor"
-- ============================================================

-- TABLE : Sources de prospection
CREATE TABLE sources (
  id SERIAL PRIMARY KEY,
  nom TEXT NOT NULL UNIQUE,
  categorie TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Pré-remplissage des 9 sources
INSERT INTO sources (nom, categorie) VALUES
  ('JPO', 'Événement ICAM'),
  ('Réseaux entreprises', 'Réseau institutionnel'),
  ('Réseau pro', 'Réseau personnel'),
  ('LinkedIn', 'Digital'),
  ('Salons', 'Événement externe'),
  ('Webinaires', 'Digital'),
  ('Smart Diag', 'Outil interne'),
  ('Anciens clients', 'Fidélisation'),
  ('Maîtres d''apprentissage', 'Réseau ICAM');

-- TABLE : Utilisateurs (synchronisée avec auth.users de Supabase)
CREATE TABLE utilisateurs (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT,
  prenom TEXT,
  role TEXT DEFAULT 'commercial',
  created_at TIMESTAMP DEFAULT NOW()
);

-- TABLE : Objectifs de contacts par source et période
CREATE TABLE objectifs (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  periode TEXT NOT NULL,
  cible_contacts INTEGER NOT NULL DEFAULT 0,
  annee INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  UNIQUE(source_id, periode, annee)
);

-- Pré-remplissage des objectifs (exemples)
INSERT INTO objectifs (source_id, periode, cible_contacts) VALUES
  (1, 'P1', 15), (1, 'P2', 15),
  (2, 'P1', 25), (2, 'P2', 25),
  (3, 'P1', 10), (3, 'P2', 10),
  (4, 'P1', 20), (4, 'P2', 20),
  (5, 'P1', 30), (5, 'P2', 30),
  (6, 'P1', 15), (6, 'P2', 15),
  (7, 'P1', 5),  (7, 'P2', 5),
  (8, 'P1', 10), (8, 'P2', 10),
  (9, 'P1', 20), (9, 'P2', 20);

-- TABLE : Événements de prospection (table principale)
CREATE TABLE evenements (
  id SERIAL PRIMARY KEY,
  quoi TEXT NOT NULL,
  source_id INTEGER REFERENCES sources(id),
  responsable_id UUID REFERENCES utilisateurs(id),
  date_evenement DATE NOT NULL,
  objectif_contacts INTEGER DEFAULT 0,
  comment_preparation TEXT,
  resultat_contacts INTEGER,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Fonction utilitaire pour calculer la période MSI à partir d'une date
CREATE OR REPLACE FUNCTION periode_msi(d DATE) RETURNS TEXT AS $$
BEGIN
  IF d IS NULL THEN RETURN NULL; END IF;
  IF EXTRACT(MONTH FROM d) BETWEEN 2 AND 6 THEN RETURN 'P1';
  ELSIF EXTRACT(MONTH FROM d) IN (9, 10, 11, 12, 1) THEN RETURN 'P2';
  ELSE RETURN 'Hors période';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- TABLE : Contacts générés (optionnel)
CREATE TABLE contacts (
  id SERIAL PRIMARY KEY,
  evenement_id INTEGER REFERENCES evenements(id) ON DELETE CASCADE,
  nom_contact TEXT,
  entreprise TEXT,
  statut TEXT DEFAULT 'Nouveau',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- POLITIQUES DE SÉCURITÉ (Row Level Security)
-- Mode simple : tous les utilisateurs connectés voient et modifient tout
-- ============================================================

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE objectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenements ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Lecture pour tout utilisateur connecté
CREATE POLICY "lecture_authentifiee" ON sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "lecture_authentifiee" ON utilisateurs FOR SELECT TO authenticated USING (true);
CREATE POLICY "lecture_authentifiee" ON objectifs FOR SELECT TO authenticated USING (true);
CREATE POLICY "lecture_authentifiee" ON evenements FOR SELECT TO authenticated USING (true);
CREATE POLICY "lecture_authentifiee" ON contacts FOR SELECT TO authenticated USING (true);

-- Écriture pour tout utilisateur connecté
CREATE POLICY "ecriture_authentifiee" ON sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecriture_authentifiee" ON objectifs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecriture_authentifiee" ON evenements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "ecriture_authentifiee" ON contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Chaque utilisateur ne modifie que sa propre fiche
CREATE POLICY "modification_propre_profil" ON utilisateurs FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Création automatique de la fiche utilisateur à l'inscription
CREATE OR REPLACE FUNCTION public.gerer_nouvel_utilisateur()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.utilisateurs (id, prenom, nom, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'prenom', ''), COALESCE(NEW.raw_user_meta_data->>'nom', ''), 'commercial');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.gerer_nouvel_utilisateur();
