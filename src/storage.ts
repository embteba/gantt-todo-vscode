import * as vscode from "vscode";
import { TaskData } from "./types";

const EMPTY_DATA: TaskData = { tasks: [] };

function getWorkspaceDataFileUri(): vscode.Uri | undefined {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return undefined;
  }
  return vscode.Uri.joinPath(workspaceFolder.uri, ".vscode", "gantt-todo-data.json");
}

function getGlobalDataFileUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, "gantt-todo-data.json");
}

function getPrimaryDataFileUri(context: vscode.ExtensionContext): vscode.Uri {
  return getWorkspaceDataFileUri() ?? getGlobalDataFileUri(context);
}

function isFileNotFoundError(error: unknown): boolean {
  if (!(error instanceof vscode.FileSystemError)) {
    return false;
  }
  return (
    error.code === "FileNotFound" ||
    error.name === "FileNotFound" ||
    error.message.includes("FileNotFound") ||
    error.message.includes("存在しないファイル")
  );
}

async function readTaskData(fileUri: vscode.Uri): Promise<TaskData | undefined> {
  try {
    const raw = await vscode.workspace.fs.readFile(fileUri);
    const decoded = new TextDecoder().decode(raw);
    const parsed = JSON.parse(decoded) as TaskData;
    if (!parsed.tasks || !Array.isArray(parsed.tasks)) {
      throw new Error("Invalid data format");
    }
    return parsed;
  } catch (error) {
    if (isFileNotFoundError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function loadTaskData(context: vscode.ExtensionContext): Promise<TaskData> {
  const workspaceFileUri = getWorkspaceDataFileUri();
  if (workspaceFileUri) {
    const workspaceData = await readTaskData(workspaceFileUri);
    if (workspaceData) {
      return workspaceData;
    }

    const globalData = await readTaskData(getGlobalDataFileUri(context));
    if (globalData) {
      await saveTaskData(context, globalData);
      return globalData;
    }

    return EMPTY_DATA;
  }

  const globalData = await readTaskData(getGlobalDataFileUri(context));
  if (globalData) {
    return globalData;
  }
  return EMPTY_DATA;
}

export async function saveTaskData(context: vscode.ExtensionContext, data: TaskData): Promise<void> {
  const fileUri = getPrimaryDataFileUri(context);
  const parentDir = vscode.Uri.joinPath(fileUri, "..");
  await vscode.workspace.fs.createDirectory(parentDir);

  const content = JSON.stringify(data, null, 2);
  await vscode.workspace.fs.writeFile(fileUri, new TextEncoder().encode(content));
}

export function getStoragePathLabel(context: vscode.ExtensionContext): string {
  return getPrimaryDataFileUri(context).fsPath;
}

export function getWorkspaceStoragePathLabel(context: vscode.ExtensionContext): string {
  const workspaceFileUri = getWorkspaceDataFileUri();
  if (workspaceFileUri) {
    return workspaceFileUri.fsPath;
  }
  return getGlobalDataFileUri(context).fsPath;
}
