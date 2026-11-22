\getenv app_password SAHVA_DB_PASSWORD
CREATE ROLE sahva LOGIN PASSWORD :'app_password';
ALTER DATABASE sahva OWNER TO sahva;
