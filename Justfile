# Justfile — cross-platform alternative to Makefile (Options A and C).
# Works on macOS, Linux, and Windows (PowerShell / cmd) without WSL2.
#
# Install just:
#   macOS/Linux:  brew install just
#   Windows:      winget install Casey.Just
#
# Option A (Docker):  just start
# Option C (Manual):  just setup && just migrate && just dev

# Cross-platform paths into the virtual environment
python_cmd := if os() == "windows" { "python" }              else { "python3" }
python     := if os() == "windows" { "venv\\Scripts\\python" } else { "venv/bin/python" }
pip        := if os() == "windows" { "venv\\Scripts\\pip" }    else { "venv/bin/pip" }

# ---------------------------------------------------------------------------
# Generate .env with random secrets if it doesn't exist.
# Uses a Python shebang so it runs cross-platform without any shell tricks.
# ---------------------------------------------------------------------------
[private]
_create-env:
    #!/usr/bin/env python3
    import os, base64, secrets
    if os.path.exists('.env'):
        print('  .env already exists — skipping.')
    else:
        content = open('.env.local.example').read()
        jwt_val  = secrets.token_urlsafe(48)
        enc_val  = base64.urlsafe_b64encode(os.urandom(32)).decode()
        content  = content.replace('REPLACE_WITH_STRONG_SECRET_AT_LEAST_32_CHARS', jwt_val)
        content  = content.replace('REPLACE_WITH_FERNET_KEY', enc_val)
        open('.env', 'w').write(content)
        print('  .env created with auto-generated secrets.')

# ---------------------------------------------------------------------------
# Option A — Docker
# ---------------------------------------------------------------------------

# Checks that Docker is installed and the daemon is running.
# Does NOT install or start Docker — the user is responsible for that.
[private]
_ensure-docker:
    #!/usr/bin/env python3
    import subprocess, sys
    try:
        running = subprocess.run(['docker', 'info'], capture_output=True).returncode == 0
    except FileNotFoundError:
        running = False
    if not running:
        print("")
        print("ERROR: Docker is not installed or not running.")
        print("")
        print("  → Download Docker Desktop from https://www.docker.com/products/docker-desktop/")
        print("    Once installed and running, re-run: just start")
        print("")
        sys.exit(1)

# Generate .env + start all services (foreground)
start: _ensure-docker _create-env
    docker compose pull --ignore-buildable
    docker compose up

# Generate .env + start all services (background)
start-d: _ensure-docker _create-env
    docker compose pull --ignore-buildable
    docker compose up -d

# Stop all services, keep data
docker-down:
    docker compose down

# Stop all services and wipe all data
docker-reset:
    docker compose down -v

# Tail the app logs
docker-logs:
    docker compose logs -f app

# Build the Docker image
docker-build:
    docker compose build

# ---------------------------------------------------------------------------
# Option C — Manual (you run PostgreSQL and Redis yourself)
# ---------------------------------------------------------------------------

# Full setup: venv + Python/Node deps + frontend build + .env
setup: _create-env _npm-install build-frontend
    {{python_cmd}} -m venv venv
    {{python}} -m pip install --upgrade pip
    {{python}} -m pip install -r requirements.txt
    @echo ""
    @echo " Setup complete!"
    @echo " Edit .env with your DATABASE_URL and REDIS_URL, then:"
    @echo "   just migrate   - run database migrations"
    @echo "   just dev       - start the app at http://localhost:8000"
    @echo ""

# Install Node dependencies (runs inside ui/ — avoids && which breaks PowerShell 5.x)
[private]
[working-directory: 'ui']
_npm-install:
    npm install

# Build frontend assets (esbuild minify + content-hash)
[working-directory: 'ui']
build-frontend:
    npm run build

# Run Alembic database migrations against the local DB
migrate:
    #!/usr/bin/env python3
    import os, sys, subprocess, tempfile
    # Normalize to forward slashes — Python accepts them on Windows too,
    # and this avoids mixed-separator strings in the generated code below.
    project     = os.path.abspath('.').replace('\\', '/')
    venv_dir    = 'Scripts' if os.name == 'nt' else 'bin'
    venv_python = f'{project}/venv/{venv_dir}/python'
    # Use repr() so the path is a valid Python literal even if it contains
    # single quotes (e.g. /Users/o'brien/project).
    p = repr(project)
    result = subprocess.run(
        [venv_python, '-c',
         f"import sys; sys.path.insert(0, {p}); "
         f"from dotenv import load_dotenv; load_dotenv({repr(project + '/.env')}); "
         f"from alembic.config import Config; from alembic import command; "
         f"cfg = Config({repr(project + '/alembic.ini')}); "
         f"cfg.set_main_option('script_location', {repr(project + '/alembic')}); "
         f"command.upgrade(cfg, 'head'); print('Migrations applied.')"],
        cwd=tempfile.gettempdir()
    )
    sys.exit(result.returncode)

# Show current Alembic revision
migrate-status:
    #!/usr/bin/env python3
    import os, sys, subprocess, tempfile
    project     = os.path.abspath('.').replace('\\', '/')
    venv_dir    = 'Scripts' if os.name == 'nt' else 'bin'
    venv_python = f'{project}/venv/{venv_dir}/python'
    p = repr(project)
    result = subprocess.run(
        [venv_python, '-c',
         f"import sys; sys.path.insert(0, {p}); "
         f"from dotenv import load_dotenv; load_dotenv({repr(project + '/.env')}); "
         f"from alembic.config import Config; from alembic import command; "
         f"cfg = Config({repr(project + '/alembic.ini')}); "
         f"cfg.set_main_option('script_location', {repr(project + '/alembic')}); "
         f"command.current(cfg, verbose=True)"],
        cwd=tempfile.gettempdir()
    )
    sys.exit(result.returncode)

# Start the FastAPI dev server with auto-reload (services must already be running)
dev: build-frontend
    {{python}} -m uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run the test suite
test:
    {{python}} -m pytest tests/ -v

# Run the linter
lint:
    {{python}} -m ruff check .
