-- Historique du biais : note de chaque facteur et mesures brutes par séance (pour mesurer
-- ce que chaque facteur annonce réellement), et rendement sur 20 séances.
alter table public.historique_biais add column notes jsonb;
alter table public.historique_biais add column rendement_20j numeric;
