-- Database D1 di Twindoku. Applicare con:
--   npx wrangler d1 execute twindoku --remote --file=schema.sql
-- Nessun dato personale: solo soprannome, avatar (emoji) e progressi.

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,             -- come l'ha scritto il giocatore
  norm        TEXT NOT NULL UNIQUE,      -- forma normalizzata, per unicità e somiglianze
  avatar      TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  pin_salt    TEXT NOT NULL,
  rec_hash    TEXT NOT NULL,             -- codice segreto di recupero
  rec_salt    TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0, -- 1 = PIN temporaneo dato dal capitano
  team_id     INTEGER,
  points      INTEGER NOT NULL DEFAULT 0, -- copia di SUM(progress), per classifiche leggere
  solved      INTEGER NOT NULL DEFAULT 0,
  created    INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_team ON players(team_id);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id  INTEGER NOT NULL,
  created    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_player ON sessions(player_id);

CREATE TABLE IF NOT EXISTS teams (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  norm       TEXT NOT NULL UNIQUE,
  pass_hash  TEXT NOT NULL,
  pass_salt  TEXT NOT NULL,
  invite     TEXT NOT NULL UNIQUE,
  captain_id INTEGER,
  created    INTEGER NOT NULL
);

-- Un caso risolto per giocatore: si tiene il risultato migliore.
CREATE TABLE IF NOT EXISTS progress (
  player_id INTEGER NOT NULL,
  key       TEXT NOT NULL,
  n         INTEGER NOT NULL,
  sc        INTEGER NOT NULL,
  stars     INTEGER NOT NULL,
  hints     INTEGER NOT NULL,
  secs      INTEGER NOT NULL,
  day       TEXT NOT NULL,               -- giorno (ora italiana) della prima soluzione
  daily     INTEGER NOT NULL DEFAULT 0,  -- 1 = era il caso del giorno quando è stato risolto
  created   INTEGER NOT NULL,
  PRIMARY KEY (player_id, key)
);
CREATE INDEX IF NOT EXISTS progress_key_day ON progress(key, day);

-- Caso del giorno: quale caso è stato proposto ogni giorno e quanti detective l'hanno risolto quel giorno.
-- I casi mai risolti tornano in rotazione (vedi pickDaily in src/index.js).
CREATE TABLE IF NOT EXISTS daily (
  day    TEXT PRIMARY KEY,               -- 'AAAA-MM-GG', ora italiana
  key    TEXT NOT NULL,
  solved INTEGER NOT NULL DEFAULT 0
);

-- Tentativi sbagliati (PIN, password di squadra, codice di recupero), per bloccare chi prova a indovinare.
CREATE TABLE IF NOT EXISTS attempts (
  k       TEXT PRIMARY KEY,
  fails   INTEGER NOT NULL,
  until   INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
