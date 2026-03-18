import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

function resolveExtensionRoot(): string {
    const bundledRoot = path.resolve(__dirname, '..');
    const multiFileRoot = path.resolve(__dirname, '..', '..');

    if (fs.existsSync(path.join(bundledRoot, 'resources'))) {
        return bundledRoot;
    }

    return multiFileRoot;
}

const extensionRoot = resolveExtensionRoot();

export function getTreeIcon(iconFileName: string): { light: vscode.Uri; dark: vscode.Uri } {
    const iconUri = vscode.Uri.file(path.join(extensionRoot, 'resources', 'icons', 'tree', iconFileName));
    return {
        light: iconUri,
        dark: iconUri,
    };
}
