# Windows Dev Server Launcher

Double-click `Start-DevServer.cmd` from the project root to start the local Astro
development server without typing the command in PowerShell.

The launcher runs `scripts/start-dev-server.ps1`, which:

- shows project-related listening ports when Windows allows process command-line inspection;
- always checks ports configured in this project's `package.json` scripts, including `4321`;
- avoids starting a second server when this project is confirmed to be running on `4321`;
- stops before startup when `4321` is occupied but cannot be safely reused, and shows its PID;
- shows the port state again after the development server exits.

Useful variants:

```powershell
# Start with the normal dev command.
.\Start-DevServer.cmd

# Start with npm run dev:clean.
.\Start-DevServer.cmd -Clean

# Only print the port report, without starting the server.
.\Start-DevServer.cmd -CheckOnly
```
