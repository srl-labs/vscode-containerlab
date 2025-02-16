// ./src/logger.ts
import * as vscode from 'vscode';

/**
 * Our shared output channel. Created once and used everywhere.
 * 
 * DO NOT import extension.ts here to avoid circular references.
 */
export const outputChannel = vscode.window.createOutputChannel('Containerlab');
