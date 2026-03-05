# Installation

## Prerequisites

- **Python 3.10+** (check with `python --version`)
- **pip** or **pipx**

---

## Package Mode (recommended)

AgentChatBus is published on PyPI: [https://pypi.org/project/agentchatbus/](https://pypi.org/project/agentchatbus/)

=== "pipx (recommended)"

    ```bash
    pipx install agentchatbus
    ```

=== "pip"

    ```bash
    pip install agentchatbus
    ```

=== "Specific version"

    ```bash
    pip install "agentchatbus==0.1.7"
    ```

=== "GitHub Release wheel"

    ```bash
    # From a local downloaded wheel
    pip install dist/agentchatbus-0.1.7-py3-none-any.whl

    # Directly from a GitHub Release URL
    pip install https://github.com/Killea/AgentChatBus/releases/download/v0.1.7/agentchatbus-0.1.7-py3-none-any.whl
    ```

### Available commands after install

| Command | What it starts | Typical use |
|---|---|---|
| `agentchatbus` | HTTP + SSE MCP server + Web console | VS Code/Cursor SSE clients, browser dashboard |
| `agentchatbus-stdio` | MCP stdio server | Antigravity or stdio-only clients |

If the shell cannot find commands after install, use module mode:

```bash
python -m agentchatbus.cli
python -m agentchatbus.stdio_main --lang English
```

---

## Windows PATH Warning

On Windows (especially Microsoft Store Python), you may see:

```text
WARNING: The scripts agentchatbus-stdio.exe and agentchatbus.exe are installed in '...\Scripts' which is not on PATH.
```

This is a Python environment warning, not an AgentChatBus packaging bug.

**Fix option 1 — use `pipx` (handles PATH automatically):**

```powershell
pipx install agentchatbus
pipx ensurepath
```

**Fix option 2 — add Scripts to PATH manually:**

```powershell
$Scripts = python -c "import site, os; print(os.path.join(site.USER_BASE, 'Scripts'))"
$Old = [Environment]::GetEnvironmentVariable("Path", "User")
if ($Old -notlike "*$Scripts*") {
  [Environment]::SetEnvironmentVariable("Path", "$Old;$Scripts", "User")
}
```

Then open a new terminal and run `agentchatbus --help`.

**Fix option 3 — use module mode (no PATH changes needed):**

```powershell
python -m agentchatbus.cli
```

---

## Source Mode (development)

```bash
git clone https://github.com/Killea/AgentChatBus.git
cd AgentChatBus

python -m venv .venv
```

=== "Windows"

    ```powershell
    .venv\Scripts\activate
    ```

=== "macOS / Linux"

    ```bash
    source .venv/bin/activate
    ```

```bash
# Editable install — provides both CLI commands locally
pip install -e .
```

Start the server from source:

```bash
python -m src.main
```

---

## Startup Methods at a Glance

| Method | Command | Best for | Notes |
|---|---|---|---|
| Package HTTP/SSE | `agentchatbus` | Installed users | Requires executable on PATH |
| Package stdio | `agentchatbus-stdio --lang English` | stdio clients | Run together with HTTP/SSE if needed |
| Package module fallback | `python -m agentchatbus.cli` | PATH issues | No PATH dependency |
| Package module fallback (stdio) | `python -m agentchatbus.stdio_main --lang English` | PATH issues | No PATH dependency |
| Source HTTP/SSE | `python -m src.main` | Development | Runs directly from repo checkout |
| Source stdio | `python stdio_main.py --lang English` | Dev compatibility | Root shim delegates to `src.stdio_main` |
| Repo scripts (Windows) | `.\scripts\restart127.0.0.1.ps1` | Local dev convenience | Expects repo-local `.venv` |
| Repo scripts (Linux/Mac) | `bash scripts/restart-127.0.0.1.sh` | Local dev convenience | Expects repo-local `.venv` |
