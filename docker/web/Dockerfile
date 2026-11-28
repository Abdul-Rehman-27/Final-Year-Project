# syntax=docker/dockerfile:1
# Build context: repository root. Serves both React apps from one nginx container.

FROM node:20-alpine AS project-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
# Vite bakes these in at build time. They are addresses the BROWSER uses.
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_MEDICAL_ASSISTANT_FRONTEND_URL=http://localhost:5174
ARG VITE_DOCTOR_API_MODE=live
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MEDICAL_ASSISTANT_FRONTEND_URL=$VITE_MEDICAL_ASSISTANT_FRONTEND_URL \
    VITE_DOCTOR_API_MODE=$VITE_DOCTOR_API_MODE
RUN npm run build

FROM node:20-alpine AS assistant-build
WORKDIR /build
COPY medical-assistant/frontend/package.json medical-assistant/frontend/package-lock.json ./
RUN npm ci
COPY medical-assistant/frontend/ .
RUN npm run build

FROM nginx:1.27-alpine
COPY docker/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=project-build /build/dist /usr/share/nginx/html/project
COPY --from=assistant-build /build/dist /usr/share/nginx/html/assistant
EXPOSE 5173 5174
