# Run CityHospital on your computer

This guide starts CityHospital, the Medical Assistant, PostgreSQL, and Ollama with Docker Compose.

## Prerequisites and configuration

Install Docker Desktop (Windows/macOS) or Docker Engine with the Compose plugin (Linux), then copy the repository to your computer. From its root folder, copy the local settings files:

```bash
cp backend/.env.example backend/.env
cp medical-assistant/.env.example medical-assistant/.env
cp .env.example .env
```

On Windows PowerShell, use `Copy-Item` instead of `cp` if needed. The stack downloads `gemma3:4b` and `gemma2:9b` into a persistent Docker volume on first startup. This can take a while and needs several GB of free disk space. Ollama does not need to be installed separately.

For Groq provider support, add a Groq API key to `GROQ_API_KEY` in `backend/.env`. This is optional; do not share or commit `.env` files.

## One-time image setup

Edit the root `.env` file and set `DOCKERHUB_USERNAME` to the image owner's Docker Hub namespace and `DOCKERHUB_REPOSITORY` to the lowercase GitHub repository name used by the publisher. Then run:

```bash
docker compose pull
```

Public images do not require Docker Hub credentials on your machine. For private images, the owner must grant your Docker Hub account access and you must run `docker login` using your own account (never the publisher's token).

Run `docker compose pull` after the image publisher has pushed the images. If they are private, the owner must grant your friend's Docker Hub account access and your friend must run `docker login` with their own account.

## Start with one click

After Docker is installed and the root `.env` has the correct image namespace and repository, start the project by double-clicking:

- Windows: `start-windows.bat`
- macOS: `Start CityHospital.command`
- Linux: run `start.sh` (double-click behavior depends on the desktop environment)

The launcher pulls the latest app images, starts the containers, waits for CityHospital to become ready, and opens it in your browser. The first start also downloads the Ollama models and can take several minutes. Docker must be running. To build from source instead, use `docker compose up --build` in a terminal.

## Open the application

- CityHospital: <http://localhost:5173>
- Medical Assistant standalone: <http://localhost:5174>
- CityHospital API docs: <http://localhost:8000/docs>
- Medical Assistant API docs: <http://localhost:8010/docs>

The CityHospital API seeds demo accounts at startup:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@cityhospital.pk` | `Admin@12345` |
| Doctor | `imran.malik@cityhospital.pk` | `Doctor@12345` |

Change demo credentials before using the system beyond local development.

## Stop and restart

- Stop: press **Ctrl+C**, or run `docker compose down`.
- Start again: `docker compose up`.
- Remove containers: `docker compose down`.
- Remove containers, database, and downloaded models: `docker compose down -v` (permanently deletes this data).

If a port is busy, change its mapping in `docker-compose.yml`. PostgreSQL uses host port `5434` by default.

## Docker Hub publishing (repository maintainer)

Create a Docker Hub access token with read/write permissions. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:

| GitHub Actions secret | Value |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub username or organization namespace |
| `DOCKERHUB_TOKEN` | The Docker Hub access token, not your account password |

The workflow at `.github/workflows/publish-dockerhub.yml` runs on pushes to `main` or `master`; it can also be started from **Actions → Build and publish Docker images → Run workflow**. It pushes four app images to `NAMESPACE/REPOSITORY-backend`, `...-frontend`, `...-medical-assistant-backend`, and `...-medical-assistant-frontend`, tagged `latest` and with the commit SHA. The GitHub repository's name forms `REPOSITORY` (lowercase). Ollama itself uses the official image, and model weights download on first run; they are not pushed to Docker Hub.
