import * as vscode from "vscode";
import { getStoragePathLabel, loadTaskData, saveTaskData } from "./storage";
import { TaskData } from "./types";

let boardPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const openCommand = vscode.commands.registerCommand("ganttTodo.open", async () => {
    if (boardPanel) {
      boardPanel.reveal(vscode.ViewColumn.One);
      await postInitMessage(boardPanel, context);
      return;
    }

    boardPanel = vscode.window.createWebviewPanel(
      "ganttTodoBoard",
      "Gantt TODO Board",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );
    const panel = boardPanel;

    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "app.js")
    );
    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "media", "app.css")
    );
    const nonce = createNonce();
    panel.webview.html = getWebviewHtml(scriptUri, styleUri, nonce, panel.webview.cspSource);

    panel.onDidDispose(
      () => {
        if (boardPanel === panel) {
          boardPanel = undefined;
        }
      },
      undefined,
      context.subscriptions
    );

    panel.webview.onDidReceiveMessage(
      async (message: unknown) => {
        if (!isMessage(message)) {
          return;
        }

        if (message.type === "save") {
          try {
            await saveTaskData(context, message.payload);
            await postInitMessage(panel, context);
            panel.webview.postMessage({ type: "saved" });
          } catch (error) {
            void vscode.window.showErrorMessage(`Failed to save task data: ${String(error)}`);
          }
        }
      },
      undefined,
      context.subscriptions
    );

    await postInitMessage(panel, context);
  });

  context.subscriptions.push(openCommand);
}

export function deactivate(): void {}

async function postInitMessage(
  panel: vscode.WebviewPanel | undefined,
  context: vscode.ExtensionContext
): Promise<void> {
  if (!panel) {
    return;
  }

  try {
    const data = await loadTaskData(context);
    panel.webview.postMessage({
      type: "init",
      payload: {
        data,
        storagePath: getStoragePathLabel(context)
      }
    });
  } catch (error) {
    void vscode.window.showErrorMessage(`Failed to load task data: ${String(error)}`);
  }
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 16; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

function getWebviewHtml(
  scriptUri: vscode.Uri,
  styleUri: vscode.Uri,
  nonce: string,
  cspSource: string
): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.tailwindcss.com;"
    />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <script nonce="${nonce}" src="https://cdn.tailwindcss.com"></script>
    <script nonce="${nonce}">
      tailwind.config = {
        theme: {
          extend: {
            boxShadow: {
              panel: "0 18px 50px -24px rgba(15, 23, 42, 0.65)"
            }
          }
        }
      };
    </script>
    <link rel="stylesheet" href="${styleUri}" />
    <title>Gantt TODO Board</title>
  </head>
  <body class="h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 antialiased">
    <main class="grid h-full w-full min-h-0 grid-cols-1 lg:grid-cols-10">
      <section class="grid min-h-0 grid-rows-[auto_auto_auto_1fr] border-r border-neutral-800 bg-neutral-950 lg:col-span-3">
        <header class="border-b border-neutral-800 px-3 py-2">
          <h1 class="text-base font-semibold tracking-tight text-neutral-100">Gantt TODO Board</h1>
          <p id="storagePath" class="mt-0.5 text-xs text-neutral-400"></p>
        </header>

        <section class="grid grid-cols-1 gap-1 border-b border-neutral-800 px-3 py-2">
          <input id="category" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500" type="text" placeholder="Category (e.g. Backend)" />
          <input id="title" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500" type="text" placeholder="Task title" />
          <div class="grid grid-cols-2 gap-1">
            <label class="grid gap-1 text-[11px] text-neutral-500">Start Date
              <input id="startDate" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500" type="date" />
            </label>
            <label class="grid gap-1 text-[11px] text-neutral-500">End Date
              <input id="endDate" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500" type="date" />
            </label>
          </div>
          <select id="status" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500">
            <option value="todo">TODO</option>
            <option value="doing">Doing</option>
            <option value="done">Done</option>
          </select>
          <select id="priority" class="rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500">
            <option value="high">High</option>
            <option value="medium" selected>Medium</option>
            <option value="low">Low</option>
          </select>
          <button id="addTask" class="rounded border border-neutral-600 bg-neutral-100 px-2 py-1.5 text-sm font-medium text-neutral-900 transition hover:bg-neutral-200">Add / Update</button>
          <p id="formError" class="hidden rounded border border-red-900/70 bg-red-950/35 px-2 py-1 text-xs text-red-300"></p>
        </section>

        <section class="border-b border-neutral-800 px-3 py-2">
          <select id="categoryFilter" class="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-sm outline-none transition focus:border-neutral-500">
            <option value="">All categories</option>
          </select>
        </section>

        <section class="min-h-0 overflow-hidden">
          <h2 class="border-b border-neutral-800 px-3 py-2 text-xs font-semibold text-neutral-300">TODO List</h2>
          <div class="h-full overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="border-b border-neutral-800 bg-neutral-950 text-xs text-neutral-400">
                <tr class="text-left">
                  <th class="px-3 py-2">Title</th>
                  <th class="px-3 py-2">Category</th>
                  <th class="px-3 py-2">Start</th>
                  <th class="px-3 py-2">End</th>
                  <th class="px-3 py-2">Status</th>
                  <th class="px-3 py-2">Priority</th>
                  <th class="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody id="taskRows" class="divide-y divide-neutral-900"></tbody>
            </table>
          </div>
        </section>
      </section>

      <section class="grid min-h-0 grid-rows-[auto_1fr] overflow-hidden bg-neutral-950 p-2 lg:col-span-7">
        <h2 class="mb-2 text-xs font-semibold text-neutral-300">Gantt View</h2>
        <div id="gantt" class="h-full overflow-x-auto overflow-y-auto border border-neutral-800 bg-neutral-950 p-2"></div>
      </section>
    </main>

    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

function isMessage(
  message: unknown
): message is { type: "save"; payload: TaskData } {
  if (!message || typeof message !== "object") {
    return false;
  }
  const maybe = message as { type?: unknown; payload?: unknown };
  return maybe.type === "save" && isTaskData(maybe.payload);
}

function isTaskData(value: unknown): value is TaskData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const maybe = value as { tasks?: unknown };
  return Array.isArray(maybe.tasks);
}
