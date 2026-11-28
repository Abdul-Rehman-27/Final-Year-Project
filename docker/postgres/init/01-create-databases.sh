#!/bin/sh
# Runs once, the first time the Postgres data volume is created.
# POSTGRES_DB (cityhospital) already exists: it holds the CityHospital project data.
# This adds the second database, used only by the Medical Assistant service.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE medical_assistant;
EOSQL
