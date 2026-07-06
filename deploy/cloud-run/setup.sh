#!/usr/bin/env bash
#
# StressForge — Cloud Run + Neo4j Aura deployment.
#
# Provisions a locked-down, minimal-privilege Cloud Run deployment of the single
# container (Fastify API + built SPA) in a dedicated GCP project, backed by a
# Neo4j Aura database. Secrets live in Secret Manager and are injected natively;
# the example gallery is seeded once via a Cloud Run Job (never on service boot).
#
# REVIEW BEFORE RUNNING. It is idempotent — safe to re-run.
#
# Prerequisites (the operator running this):
#   - gcloud CLI authenticated (`gcloud auth login`) with rights on PROJECT_ID:
#       roles/run.admin, roles/artifactregistry.admin, roles/secretmanager.admin,
#       roles/iam.serviceAccountAdmin, roles/serviceusage.serviceUsageAdmin,
#       roles/iam.serviceAccountUser  (Owner covers all of these).
#   - A Neo4j Aura instance (https://console.neo4j.io) — its URI/user/password.
#   - Run from the repo root.
#
# Usage:
#   cp deploy/cloud-run/config.env.example deploy/cloud-run/config.env
#   # edit config.env
#   ./deploy/cloud-run/setup.sh
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
[ -f "$HERE/config.env" ] && source "$HERE/config.env"

# ---- Resolve config (env overrides config.env; sensible defaults) ----
: "${PROJECT_ID:?set PROJECT_ID (in deploy/cloud-run/config.env or env)}"
: "${NEO4J_URI:?set NEO4J_URI}"
: "${NEO4J_PASSWORD:?set NEO4J_PASSWORD}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-stressforge}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
DEFAULT_LLM_MODEL="${DEFAULT_LLM_MODEL:-claude-opus-4-8}"
MIN_INSTANCES="${MIN_INSTANCES:-0}"
MAX_INSTANCES="${MAX_INSTANCES:-1}"
DOMAIN="${DOMAIN:-}"
JWT_SECRET="${JWT_SECRET:-}"
APP_ENCRYPTION_KEY="${APP_ENCRYPTION_KEY:-}"
GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-}"
GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-}"
X_CLIENT_ID="${X_CLIENT_ID:-}"
X_CLIENT_SECRET="${X_CLIENT_SECRET:-}"

REPO="stressforge"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:$(date +%Y%m%d-%H%M%S)"
RUNTIME_SA="stressforge-run@${PROJECT_ID}.iam.gserviceaccount.com"
SEED_JOB="stressforge-seed"

echo "==> Project: $PROJECT_ID  Region: $REGION  Service: $SERVICE"
gcloud config set project "$PROJECT_ID" >/dev/null

# ---- 1. Enable required APIs ----
echo "==> Enabling APIs..."
gcloud services enable \
  run.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com iam.googleapis.com --quiet

# ---- 2. Artifact Registry repo (idempotent) ----
if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
  echo "==> Creating Artifact Registry repo '$REPO'..."
  gcloud artifacts repositories create "$REPO" --repository-format=docker --location "$REGION" \
    --description="StressForge images" --quiet
fi

# ---- 3. Secrets in Secret Manager ----
# put_secret NAME VALUE  — creates the secret if missing, adds a version if the value is non-empty.
put_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic --quiet
  fi
  if [ -n "$value" ]; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --quiet >/dev/null
  fi
}

echo "==> Writing secrets..."
[ -z "$JWT_SECRET" ] && JWT_SECRET="$(openssl rand -hex 32)"
[ -z "$APP_ENCRYPTION_KEY" ] && APP_ENCRYPTION_KEY="$(openssl rand -hex 32)"
put_secret JWT_SECRET "$JWT_SECRET"
put_secret APP_ENCRYPTION_KEY "$APP_ENCRYPTION_KEY"
put_secret NEO4J_URI "$NEO4J_URI"
put_secret NEO4J_PASSWORD "$NEO4J_PASSWORD"
[ -n "$GOOGLE_CLIENT_ID" ] && put_secret GOOGLE_CLIENT_ID "$GOOGLE_CLIENT_ID"
[ -n "$GOOGLE_CLIENT_SECRET" ] && put_secret GOOGLE_CLIENT_SECRET "$GOOGLE_CLIENT_SECRET"
[ -n "$X_CLIENT_ID" ] && put_secret X_CLIENT_ID "$X_CLIENT_ID"
[ -n "$X_CLIENT_SECRET" ] && put_secret X_CLIENT_SECRET "$X_CLIENT_SECRET"

# ---- 4. Minimal-privilege runtime service account ----
if ! gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  echo "==> Creating runtime service account..."
  gcloud iam service-accounts create stressforge-run \
    --display-name="StressForge Cloud Run runtime" --quiet
fi

# Grant secretAccessor per-secret (least privilege — NOT project-wide).
grant_secret() {
  gcloud secrets add-iam-policy-binding "$1" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" --quiet >/dev/null
}
echo "==> Granting per-secret access to the runtime SA..."
for s in JWT_SECRET APP_ENCRYPTION_KEY NEO4J_URI NEO4J_PASSWORD \
         GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET X_CLIENT_ID X_CLIENT_SECRET; do
  gcloud secrets describe "$s" >/dev/null 2>&1 && grant_secret "$s"
done

# ---- 5. Build the image (Cloud Build with our Dockerfile) ----
echo "==> Building image via Cloud Build: $IMAGE"
gcloud builds submit "$REPO_ROOT" \
  --config "$HERE/cloudbuild.yaml" \
  --substitutions "_IMAGE=${IMAGE}" --quiet

# ---- 6. Assemble --set-secrets and --set-env-vars ----
BASE_URL="${DOMAIN:+https://$DOMAIN}"
BASE_URL="${BASE_URL:-http://localhost}"   # placeholder; corrected after first deploy if no DOMAIN

SECRETS="JWT_SECRET=JWT_SECRET:latest,APP_ENCRYPTION_KEY=APP_ENCRYPTION_KEY:latest,NEO4J_URI=NEO4J_URI:latest,NEO4J_PASSWORD=NEO4J_PASSWORD:latest"
for s in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET X_CLIENT_ID X_CLIENT_SECRET; do
  gcloud secrets describe "$s" >/dev/null 2>&1 && SECRETS="${SECRETS},${s}=${s}:latest"
done

ENV_VARS="SEED_EXAMPLES=false,NEO4J_USER=${NEO4J_USER},DEFAULT_LLM_MODEL=${DEFAULT_LLM_MODEL},PUBLIC_BASE_URL=${BASE_URL},CORS_ORIGIN=${BASE_URL}"

# ---- 7. Deploy the Cloud Run service (public read gallery) ----
echo "==> Deploying Cloud Run service '$SERVICE'..."
gcloud run deploy "$SERVICE" \
  --image "$IMAGE" \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances "$MIN_INSTANCES" --max-instances "$MAX_INSTANCES" \
  --set-env-vars "$ENV_VARS" \
  --set-secrets "$SECRETS" \
  --quiet

RUN_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

# ---- 8. Fix PUBLIC_BASE_URL/CORS to the real origin (Cloud Run URL or custom domain) ----
FINAL_URL="${DOMAIN:+https://$DOMAIN}"
FINAL_URL="${FINAL_URL:-$RUN_URL}"
if [ "$FINAL_URL" != "$BASE_URL" ]; then
  echo "==> Setting PUBLIC_BASE_URL/CORS_ORIGIN to $FINAL_URL"
  gcloud run services update "$SERVICE" --region "$REGION" \
    --update-env-vars "PUBLIC_BASE_URL=${FINAL_URL},CORS_ORIGIN=${FINAL_URL}" --quiet
fi

# ---- 9. Seed the public example gallery once (race-free Cloud Run Job) ----
echo "==> Creating + running the one-shot seed Job..."
if gcloud run jobs describe "$SEED_JOB" --region "$REGION" >/dev/null 2>&1; then
  gcloud run jobs update "$SEED_JOB" --region "$REGION" --image "$IMAGE" \
    --service-account "$RUNTIME_SA" \
    --set-env-vars "NEO4J_USER=${NEO4J_USER}" \
    --set-secrets "NEO4J_URI=NEO4J_URI:latest,NEO4J_PASSWORD=NEO4J_PASSWORD:latest" \
    --command node --args "apps/api/dist/seed-cli.js" --quiet
else
  gcloud run jobs create "$SEED_JOB" --region "$REGION" --image "$IMAGE" \
    --service-account "$RUNTIME_SA" \
    --set-env-vars "NEO4J_USER=${NEO4J_USER}" \
    --set-secrets "NEO4J_URI=NEO4J_URI:latest,NEO4J_PASSWORD=NEO4J_PASSWORD:latest" \
    --command node --args "apps/api/dist/seed-cli.js" --quiet
fi
gcloud run jobs execute "$SEED_JOB" --region "$REGION" --wait --quiet

# ---- 10. Done ----
cat <<EOF

==================================================================
 StressForge is live:  ${FINAL_URL}
==================================================================
 - Public example gallery is browsable with no login.
 - Neo4j: ${NEO4J_URI}  (Aura)
 - Runtime SA: ${RUNTIME_SA}  (secretAccessor on individual secrets only)
 - Scaling: min=${MIN_INSTANCES} max=${MAX_INSTANCES}

 If using OAuth, set these redirect URIs in the provider consoles:
   Google:  ${FINAL_URL}/api/auth/oauth/google/callback
   X:       ${FINAL_URL}/api/auth/oauth/x/callback
$( [ -n "$DOMAIN" ] && echo "
 Custom domain: map it to the service with
   gcloud run domain-mappings create --service ${SERVICE} --domain ${DOMAIN} --region ${REGION}
 then point a CNAME/A record at the value it prints." )
 Redeploy later:  ./deploy/cloud-run/setup.sh   (idempotent)
==================================================================
EOF
