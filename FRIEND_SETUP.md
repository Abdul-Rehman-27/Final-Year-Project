# Run CityHospital on your computer

This guide starts the complete project: CityHospital, the Medical Assistant, and PostgreSQL. Docker handles Python, Node, and database setup for you.

## 1. Install the prerequisites

- Install **Docker Desktop** (Windows or macOS), or Docker Engine with the Docker Compose plugin (Linux).
- Start Docker and wait until it reports that it is running.
- Get a copy of this project on your computer (download the ZIP and extract it, or clone the repository).

## 2. Open a terminal in the project folder

Change directory to the folder that contains `docker-compose.yml`. For example:

```bash
cd CityHospital
```

On Windows, open PowerShell in the extracted project folder instead.

## 3. Create the local settings files

Run these commands from the project folder:

**macOS / Linux / Git Bash:**

```bash
cp backend/.env.example backend/.env
cp medical-assistant/.env.example medical-assistant/.env
```

**Windows PowerShell:**

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item medical-assistant/.env.example medical-assistant/.env
```

The project can start without an AI provider key, but AI chat and summaries need a working provider. To use Groq, get a GroqCloud API key and put it after `GROQ_API_KEY=` in `backend/.env`. Keep the key private and do not send or commit your `.env` files. Ollama can be used instead if it is installed and running on your computer; see `medical-assistant/README.md` for its settings.

## 4. Build and start the project

Run from the project folder:

```bash
docker compose up --build
```

The first build may take several minutes. Keep this terminal open while using the project. Wait until the services have started, then open:

- CityHospital: <http://localhost:5173>
- Medical Assistant standalone: <http://localhost:5174>
- CityHospital API documentation: <http://localhost:8000/docs>
- Medical Assistant API documentation: <http://localhost:8010/docs>

## 5. Sign in or create an account

The seeded demo accounts are:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@cityhospital.pk` | `Admin@12345` |
| Doctor | `imran.malik@cityhospital.pk` | `Doctor@12345` |

For a patient account, choose **Register** in CityHospital, create an account, then sign in as **Patient**. The patient dashboard embeds the Medical Assistant.

## 6. Stop or restart

- To stop, press **Ctrl+C** in the terminal running Docker Compose.
- To start again later, run `docker compose up` from the project folder.
- To stop and remove the containers, run `docker compose down`.
- To also erase the saved PostgreSQL database and start fresh, run `docker compose down -v`. This permanently deletes the project's database data.

The database is retained when you stop or rebuild the containers. If a port is already in use, close the other app using it or change the host port configuration in a root `.env` file; PostgreSQL defaults to port `5434` on your computer.

## Troubleshooting

- **Docker command not found / cannot connect:** Start or install Docker Desktop, then reopen the terminal.
- **A page does not load right away:** The first startup takes time. Check the Compose terminal and wait for the services to finish starting.
- **Port already in use:** Another program may be using `5173`, `5174`, `8000`, `8010`, or `5434`. Stop that program and retry.
- **AI response/provider error:** Check that `GROQ_API_KEY` is set correctly in `backend/.env`, then restart with `docker compose up`.
