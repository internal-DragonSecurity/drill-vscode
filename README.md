# Drill Agent (VS Code / OpenVSCode)

Run the **DragonSecurity/drill** agent from VS Code or OpenVSCode Server. If you don't set a path, the extension can **auto-install the latest `drill-server`** from GitHub Releases for your OS/arch.

> ⚠️ This is a **workspace** extension (runs on the server/remote). It won't work on `vscode.dev`/`github.dev`.

## Features
- Start/stop the Drill agent and stream logs to an Output Channel
- Run one-off commands with arguments
- Auto-install the latest `drill-server_<os>_<arch>` from Releases
- Optional Docker Compose mode

## Commands
- **Drill: Start Agent**
- **Drill: Stop Agent**
- **Drill: Run Command…**
- **Drill: Install/Update Agent**

## Settings
- `drill.path` (string): Absolute path to an existing Drill binary. Leave empty to auto-install.
- `drill.args` (string[]): CLI args when starting the agent (default: `[]`).
- `drill.cwd` (string): Working directory for the process (default: `${workspaceFolder}`).
- `drill.autoInstall` (boolean): Auto-install the latest release when no path is set (default: `true`).
- `drill.composeFile` (string): If set, the extension will run `docker compose -f <file> up <service>` instead of a local binary.
- `drill.composeService` (string): Compose service name (default: `drill`).

## OpenVSCode
This extension is tagged with `"extensionKind": ["workspace"]`, so it runs where Node APIs are available (OpenVSCode Server, Remote-SSH, Codespaces, Dev Containers). It won't run as a **web extension** in purely browser-hosted editors.

## Development
1. `npm install`
2. Press **F5** in VS Code to launch the extension host
3. Run “Drill: Start Agent”

## Notes
- Current Drill releases publish raw binaries named like `drill_linux_amd64`, `drill_darwin_arm64`, `drill_windows_amd64`, etc. The extension picks the one matching your platform and installs it under the extension’s global storage.
- If your organization changes asset names or switches to archives, update `src/installer.ts` accordingly.