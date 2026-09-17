# Quotation AI VM Migration Runbook

## Objective
This runbook documents the migration and setup of the Quotation AI application on a VM, including the PostgreSQL database, Gotenberg PDF rendering service, and service connectivity checks required for production use.

## Architecture
The migrated environment includes:

- PostgreSQL 17 for application data
- Gotenberg 8 for PDF generation and document rendering
- Application database named `quotation_db`
- Database user `quotation_user`
- Standardized pricing catalog and quotation numbering
- Docker Compose-driven deployment

## Prerequisites
Before starting the migration, ensure the VM has:

- Docker installed and running
- Docker Compose available
- Git installed
- Ports that are not already in use
- Network access to the application services

The environment used in the migration included:

- PostgreSQL exposure: `5435:5432`
- Gotenberg exposure: `3100:3000`

## Environment Setup
### 1. Clone the repository
```bash
cd ~
git clone <repository-url> quotation-ai
cd quotation-ai
```

### 2. Configure environment variables
```bash
cat > .env <<'EOF'
POSTGRES_DB=quotation_db
POSTGRES_USER=quotation_user
POSTGRES_PASSWORD=Password1234
POSTGRES_PORT=5435
GOTENBERG_PORT=3000
EOF
```

### 3. Add local ignore rules
```bash
cat > .gitignore <<'EOF'
.env
data/
*.log
.DS_Store
EOF
```

## Docker Compose Configuration
The service stack is defined in `docker-compose.yml` and includes the PostgreSQL and Gotenberg containers.

```yaml
services:
  quotation-postgres:
    image: postgres:17-alpine
    container_name: quotation-postgres
    restart: unless-stopped

    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}

    ports:
      - "${POSTGRES_PORT}:5432"

    volumes:
      - ./data/postgres:/var/lib/postgresql/data

    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  quotation-gotenberg:
    image: gotenberg/gotenberg:8
    container_name: quotation-gotenberg
    restart: unless-stopped

    ports:
      - "${GOTENBERG_PORT}:3000"

    command:
      - "gotenberg"
      - "--api-timeout=120s"
```

## Launch the Services
Run the following commands to pull and start the containers:

```bash
docker compose pull
docker compose up -d
```

### Validate container health
```bash
docker compose ps
docker compose logs --tail=50
```

### Health check for Gotenberg
```bash
curl http://localhost:3100/health
```

A healthy response should look like:

```json
{"status":"up","details":{"chromium":{"status":"up"},"libreoffice":{"status":"up"}}}
```

## Database Initialization
Create the SQL seed directory and load the schema.

```bash
mkdir -p postgres/init
```

### Schema setup
```bash
docker exec -i quotation-postgres \
psql -U quotation_user -d quotation_db \
< postgres/init/001_schema.sql
```

The schema creates the following core tables:

- `customers`
- `quotations`
- `quotation_items`
- `quotation_versions`
- `quotation_files`
- `pricing_master`
- `quotation_actions`

It also creates:

- indexes for search and lookup performance
- the `update_updated_at_column()` trigger function
- update triggers for customer, quotation, and pricing records

### Pricing master data
Load the base pricing catalog:

```bash
docker exec -i quotation-postgres \
psql -U quotation_user -d quotation_db \
< postgres/init/002_pricing_master.sql
```

This populates categories such as:

- Website
- Mobile App
- Integration
- SEO
- Cloud
- Design
- Other

Example rows include:

- `Business Website` — `35000`
- `Landing Page` — `10000`
- `UI/UX Design` — `15000`
- `Razorpay Payment Gateway` — `5000`
- `Monthly SEO` — `15000`

### Quotation numbering
Load the quotation sequence and generator:

```bash
docker exec -i quotation-postgres \
psql -U quotation_user -d quotation_db \
< postgres/init/003_quotation_number.sql
```

Then validate it:

```bash
docker exec -it quotation-postgres \
psql -U quotation_user -d quotation_db \
-c "SELECT generate_quotation_number();"
```

Expected output example:

```text
generate_quotation_number
---------------------------
STD-QTN-2026-0001
```

## Post-Deployment Verification
Run the checks below to verify the stack is working.

```bash
docker exec quotation-postgres pg_isready -U quotation_user -d quotation_db
docker exec -it quotation-postgres psql -U quotation_user -d quotation_db -c "\dt"
```

Confirm the tables are visible and the service is accepting connections.

## Network and External Service Connectivity
If the VM already has a local service using port `3000`, move the Gotenberg port to a free port such as `3100` in `.env` and re-run:

```bash
docker compose up -d quotation-gotenberg
```

For n8n or workflow integrations, place the services on the same Docker network:

```bash
docker network inspect quotation-ai_default

docker network connect quotation-ai_default lead-n8n
```

Then validate host connectivity from the workflow container:

```bash
docker exec lead-n8n sh -c 'wget -qO- http://quotation-gotenberg:3000/health'
```

## Troubleshooting
### Port conflict on Gotenberg
If the VM already has a process bound to port `3000`, the service will fail to start. Use an alternate exposed port:

```bash
GOTENBERG_PORT=3100
```

Then restart the container:

```bash
docker compose up -d quotation-gotenberg
```

### Database connectivity issues
Check Postgres availability:

```bash
docker exec quotation-postgres pg_isready -U quotation_user -d quotation_db
```

Check if the schema is loaded:

```bash
docker exec -it quotation-postgres psql -U quotation_user -d quotation_db -c "\dt"
```

## Final Migration Checklist
The migration is complete when all of the following are true:

- [ ] PostgreSQL container is running and healthy
- [ ] Gotenberg container is running and responding on the configured port
- [ ] Database tables are created successfully
- [ ] Payment/pricing data is loaded
- [ ] Quotation number generator returns valid IDs
- [ ] Workflow containers can reach the database and Gotenberg services
- [ ] Application is ready for quote generation and PDF export

## Summary
This migration pattern provides a stable VM deployment for the Quotation AI stack, keeping the database and document rendering services isolated in Docker while enabling workflow automation and business operations to run reliably in a containerized environment.
