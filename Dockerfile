# =============================================================
# DOCKERFILE MULTI-STAGE - TAPI BACKEND CHALLENGE
# STAGES:
#   base        -> dependencias comunes
#   development -> con devDependencies + ts-node (sandbox/qa)
#   builder     -> compila TypeScript a JavaScript
#   production  -> imagen minima solo con dist/ (preprod/prod)
# =============================================================

# STAGE 1: BASE - DEPENDENCIAS DE RUNTIME COMPARTIDAS
FROM node:20-alpine AS base
LABEL maintainer="tapi-backend-challenge"
WORKDIR /app

# COPIAR SOLO LOS MANIFIESTOS PRIMERO (CACHE DE CAPAS)
COPY package*.json ./
COPY tsconfig.json ./

# STAGE 2: DEVELOPMENT - INCLUYE DEVDEPENDENCIES Y TS-NODE
# PARA SANDBOX Y QA - HOT RELOAD Y DEBUGGING
FROM base AS development
ENV NODE_ENV=sandbox

# INSTALAR TODAS LAS DEPENDENCIAS (INCLUYENDO DEV)
RUN npm ci --include=dev --legacy-peer-deps

# COPIAR EL CODIGO FUENTE
COPY src/ ./src/

# VERIFICAR QUE EL CODIGO COMPILA SIN ERRORES
RUN npx tsc --noEmit

# EXPONER PUERTO PARA DEBUG (OPCIONAL)
EXPOSE 9229

# DEFAULT: EJECUTAR EL SCHEDULER (PUEDE SOBREESCRIBIRSE EN docker-compose)
CMD ["ts-node", "--transpile-only", "src/main/schedulerLambda.ts"]

# STAGE 3: BUILDER - COMPILA TYPESCRIPT A JAVASCRIPT
FROM base AS builder

# INSTALAR TODAS LAS DEPENDENCIAS (NECESARIAS PARA COMPILAR)
RUN npm ci --include=dev --legacy-peer-deps

COPY src/ ./src/

# COMPILAR TYPESCRIPT -> JAVASCRIPT EN /app/dist
RUN npx tsc --project tsconfig.json

# PRUNING: DEJAR SOLO DEPENDENCIAS DE PRODUCCION
RUN npm prune --omit=dev --legacy-peer-deps

# STAGE 4: PRODUCTION - IMAGEN MINIMA LISTA PARA LAMBDA/ECS
# SOLO CONTIENE: dist/ + node_modules de produccion
FROM node:20-alpine AS production

# METADATOS DE LA IMAGEN
ARG BUILD_DATE
ARG GIT_SHA
LABEL build_date="${BUILD_DATE}" git_sha="${GIT_SHA}"

# USUARIO NO ROOT POR SEGURIDAD
RUN addgroup -g 1001 -S nodejs && adduser -S tapi -u 1001 -G nodejs

WORKDIR /app

# COPIAR SOLO LO NECESARIO DESDE EL BUILDER
COPY --from=builder --chown=tapi:nodejs /app/dist ./dist
COPY --from=builder --chown=tapi:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=tapi:nodejs /app/package.json ./

USER tapi

# EN AWS LAMBDA EL HANDLER SE SETEA COMO VARIABLE DE ENTORNO
# CMD ES SOBREESCRITO POR EL EVENT SOURCE DE LAMBDA
CMD ["node", "dist/main/schedulerLambda.js"]
