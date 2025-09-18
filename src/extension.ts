import * as vscode from "vscode";
import { spawn, ChildProcessWithoutNullStreams, spawnSync } from "child_process";
import * as os from "os";
import * as path from "path";
import { ensureDrill } from "./installer";

let proc: ChildProcessWithoutNullStreams | undefined;
let output = vscode.window.createOutputChannel("Drill Agent");
let status: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.text = "$(play) Drill";
  status.command = "drill.startAgent";
  status.tooltip = "Start Drill Agent";
  status.show();

  context.subscriptions.push(
    vscode.commands.registerCommand("drill.startAgent", () => startAgent(context)),
    vscode.commands.registerCommand("drill.stopAgent", stopAgent),
    vscode.commands.registerCommand("drill.run", () => runOnce(context)),
    vscode.commands.registerCommand("drill.installOrUpdate", () => installOrUpdate(context)),
    { dispose: deactivate }
  );
}

export function deactivate() {
  stopAgent();
}

function getCfg<T = any>(key: string): T | undefined {
  return vscode.workspace.getConfiguration().get<T>(key);
}

function resolveCwd(): string {
  const setting = getCfg<string>("drill.cwd");
  if (setting && setting.includes("${workspaceFolder}")) {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return folder ? setting.replace("${workspaceFolder}", folder) : os.homedir();
  }
  return setting || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
}

function buildArgsFromSettings(): string[] {
  const args: string[] = [];
  const sshHost = getCfg<string>("drill.sshHost") || "getexposed.io";
  const sshPort = getCfg<number>("drill.sshPort") ?? 2200;
  const localHost = getCfg<string>("drill.localHost") || "localhost";
  const localPort = getCfg<number>("drill.localPort") ?? 7500;
  const bindPort = getCfg<number>("drill.bindPort") ?? 0;
  const id = (getCfg<string>("drill.id") || "").trim();
  const password = (getCfg<string>("drill.password") || "").trim();
  const keepAlive = !!getCfg<boolean>("drill.keepAlive");
  const autoReconnect = !!getCfg<boolean>("drill.autoReconnect");

  if (sshHost) { args.push("-s", sshHost); }
  if (sshPort) { args.push("-p", String(sshPort)); }
  if (localHost) { args.push("-ls", localHost); }
  if (localPort) { args.push("-lp", String(localPort)); }
  args.push("-bp", String(bindPort || 0));
  if (id) { args.push("-id", id); }
  if (password) { args.push("-pw", password); }
  if (keepAlive) { args.push("-a"); }
  if (autoReconnect) { args.push("-r"); }

  const extra = getCfg<string[]>("drill.args") || [];
  for (const e of extra) if (e && e.trim()) args.push(e);

  return args;
}

async function installOrUpdate(context: vscode.ExtensionContext): Promise<string | undefined> {
  try {
    const p = await ensureDrill(context, { installIfMissing: true });
    vscode.window.showInformationMessage(`Drill installed at ${p}`);
    return p;
  } catch (e: any) {
    vscode.window.showErrorMessage(`Failed to install Drill: ${e?.message || e}`);
    return undefined;
  }
}

async function resolveBinary(context: vscode.ExtensionContext): Promise<string | undefined> {
  const userPath = (getCfg<string>("drill.path") || "").trim();
  if (userPath) return userPath;

  // Try to use previously-installed copy (even if auto-install is off)
  try {
    const path = await ensureDrill(context, { installIfMissing: false });
    if (path) return path;
  } catch {}

  const autoInstall = !!getCfg<boolean>("drill.autoInstall");
  if (!autoInstall) return undefined;

  return await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Installing Drill…" },
    async () => await ensureDrill(context, { installIfMissing: true })
  );
}

async function startAgent(context: vscode.ExtensionContext) {
  if (proc) {
    vscode.window.showInformationMessage("Drill agent is already running.");
    return;
  }

  const composeFile = (getCfg<string>("drill.composeFile") || "").trim();
  const composeService = (getCfg<string>("drill.composeService") || "drill").trim();
  const cwd = resolveCwd();

  output.clear();
  output.show(true);

  if (composeFile) {
    const args = ["compose", "-f", composeFile, "up", composeService];
    output.appendLine(`$ docker ${args.join(" ")}`);
    proc = spawn("docker", args, { cwd, env: process.env });
  } else {
    const binPath = await resolveBinary(context);
    if (!binPath) {
      vscode.window.showWarningMessage("No drill.path set and auto-install is disabled.");
      return;
    }
    const args = buildArgsFromSettings();
    output.appendLine(`$ ${binPath} ${args.join(" ")}`);
    proc = spawn(binPath, args, { cwd, env: process.env });
  }

  wireProcess(proc);
  status.text = "$(debug-stop) Drill (running)";
  status.command = "drill.stopAgent";
  status.tooltip = "Stop Drill Agent";
}

function stopAgent() {
  if (!proc) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(proc.pid), "/t", "/f"]);
    } else {
      proc.kill("SIGINT");
      setTimeout(() => proc && proc.kill("SIGKILL"), 1500);
    }
  } catch { /* noop */ }
  finally {
    proc = undefined;
    status.text = "$(play) Drill";
    status.command = "drill.startAgent";
    status.tooltip = "Start Drill Agent";
  }
}

async function runOnce(context: vscode.ExtensionContext) {
  const cwd = resolveCwd();
  const binPath = await resolveBinary(context);
  if (!binPath) {
    vscode.window.showWarningMessage("No drill.path set and auto-install is disabled.");
    return;
  }

  const input = await vscode.window.showInputBox({
    title: "Drill: extra arguments",
    placeHolder: "Optional extra args, e.g. --version"
  });
  if (input === undefined) return;

  const argsInput = input.trim() ? input.trim().split(/\s+/) : [];
  const base = buildArgsFromSettings();
  const args = [...base, ...argsInput];
  output.show(true);
  output.appendLine(`$ ${binPath} ${args.join(" ")}`);
  const child = spawn(binPath, args, { cwd, env: process.env });
  wireProcess(child);
}

function wireProcess(child: ChildProcessWithoutNullStreams) {
  child.stdout.on("data", d => output.append(d.toString()));
  child.stderr.on("data", d => output.append(d.toString()));
  child.on("close", code => {
    output.appendLine(`\n[process exited with code ${code}]`);
    if (child === proc) {
      proc = undefined;
      status.text = "$(play) Drill";
      status.command = "drill.startAgent";
      status.tooltip = "Start Drill Agent";
    }
  });
}