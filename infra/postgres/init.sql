-- One schema per service, so each service owns its own tables.
-- Postgres runs this file only the first time the data volume is created.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS rules;
CREATE SCHEMA IF NOT EXISTS scheduler;
CREATE SCHEMA IF NOT EXISTS notification;
