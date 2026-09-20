import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Mechanical Invariants Gate (R11.14)', () => {
  const projectRoot = process.cwd();

  it('enforces that root directory contains zero scratch/patch scripts or temporary logs', () => {
    const ALLOWED_ROOT_FILES = new Set([
      '.eslintrc.cjs',
      '.gitignore',
      'AGENTS.md',
      'PROGRESS.md',
      'index.html',
      'package.json',
      'package-lock.json',
      'postcss.config.js',
      'tailwind.config.js',
      'tsconfig.json',
      'vite.config.ts',
      'vitest.config.ts',
      'vitest.setup.ts'
    ]);

    const rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true });
    const illegalFiles: string[] = [];

    for (const entry of rootEntries) {
      if (entry.isFile() && !ALLOWED_ROOT_FILES.has(entry.name)) {
        illegalFiles.push(entry.name);
      }
    }

    expect(illegalFiles).toEqual([]);
  });

  it('enforces that every frontend invoke(...) call matches a registered Tauri command in main.rs', () => {
    const mainRsPath = path.join(projectRoot, 'src-tauri/src/main.rs');
    expect(fs.existsSync(mainRsPath)).toBe(true);

    const mainRsContent = fs.readFileSync(mainRsPath, 'utf-8');
    const handlerMatch = mainRsContent.match(/tauri::generate_handler!\[([^\]]+)\]/s);
    expect(handlerMatch).not.toBeNull();

    const registeredCommands = new Set(
      handlerMatch![1]
        .split(',')
        .map(cmd => cmd.trim())
        .filter(cmd => cmd.length > 0 && !cmd.startsWith('//'))
    );

    function walkDir(dir: string, fileList: string[] = []): string[] {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const full = path.join(dir, file.name);
        if (file.isDirectory()) {
          if (file.name !== 'node_modules' && file.name !== '.git' && file.name !== 'dist') {
            walkDir(full, fileList);
          }
        } else if (file.name.endsWith('.ts') || file.name.endsWith('.tsx')) {
          fileList.push(full);
        }
      }
      return fileList;
    }

    const srcFiles = walkDir(path.join(projectRoot, 'src'));
    const invokeRegex = /invoke(?:\s*<[^>]+>)?\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    const unregisteredInvokes: Array<{ file: string; command: string }> = [];

    for (const file of srcFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      let match;
      while ((match = invokeRegex.exec(content)) !== null) {
        const cmd = match[1];
        if (!registeredCommands.has(cmd)) {
          unregisteredInvokes.push({ file: path.relative(projectRoot, file), command: cmd });
        }
      }
    }

    expect(unregisteredInvokes).toEqual([]);
  });


  it('enforces that runtimeConfig strictly defaults to live and gates demo behind DEV', () => {
    const runtimeConfigPath = path.join(projectRoot, 'src/services/runtimeConfig.ts');
    const content = fs.readFileSync(runtimeConfigPath, 'utf-8');
    expect(content).toContain("currentRuntimeMode: RuntimeMode = 'live'");
    expect(content).not.toContain("currentRuntimeMode: RuntimeMode = 'demo'");
    expect(content).toContain('import.meta.env.DEV');
  });
});
