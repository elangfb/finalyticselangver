// generate-full-context.ts
// A script to perform static analysis on a TypeScript/JavaScript/HTML codebase
// and generate a comprehensive `llms-full.txt` context file for Large Language Models.
//
// This variant includes the FULL SOURCE of each file with line-number prefixes.
//
// Prerequisites: pnpm install -D typescript ignore
// Usage:         pnpx tsx scripts/generate-full-context.ts

import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { Ignore } from 'ignore';
import ignore from 'ignore';

// --- Configuration ---
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, 'llms-full.txt');
const SRC_DIRECTORIES = ['src']; // Primary directories to scan for source code (kept for parity; traversal starts at ROOT)
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html'];
const DOC_FILES = ['README.md', 'CONTRIBUTING.md'];

interface FileAnalysis {
  path: string;
  imports: string[];
  lineCount: number;
}

// --- Main Orchestrator ---

async function main() {
  console.log('🤖 Starting full codebase analysis...');

  // Layer 0 & 1: Project Identity and File Structure
  const projectName = path.basename(ROOT_DIR);
  const gitignore = getGitignorePatterns();
  const allFiles = getAllFiles(ROOT_DIR, gitignore);

  // Layer 2 & 3: Deep Analysis
  console.log(`Analyzing ${allFiles.length} files...`);
  const analyzedFiles: FileAnalysis[] = [];
  for (const file of allFiles) {
    if (FILE_EXTENSIONS.includes(path.extname(file))) {
      const analysis = analyzeCodeFile(file);
      if (analysis) {
        analyzedFiles.push(analysis);
      }
    }
  }

  const externalDependencies = analyzePackageJson();
  const dependencyGraph = buildDependencyGraph(analyzedFiles);
  const mermaidGraph = generateMermaidGraph(dependencyGraph);

  // Synthesize the final context file
  console.log('🧩 Synthesizing context file with full sources...');
  const contextContent = formatContextFile({
    projectName,
    allFiles,
    analyzedFiles,
    externalDependencies,
    mermaidGraph,
  });

  fs.writeFileSync(OUTPUT_FILE, contextContent);
  console.log(`✅ Successfully generated full context file at ${OUTPUT_FILE}`);
}

// --- Analysis Functions ---

/**
 * Reads and parses the .gitignore file.
 */
function getGitignorePatterns(): Ignore {
  const ig = ignore();
  const gitignorePath = path.join(ROOT_DIR, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath).toString());
  }
  // Add common ignores that might not be in .gitignore
  ig.add([
    'node_modules', '.git', 'dist', 'build', '*.log', 'llms.txt', 'llms-full.txt',
    '.*', 'docs',
    'eslint.config.mjs', 'scripts/*',
    'justfile',
    'pdf-*.html',
    '*-legacy.*',
  ]);
  return ig;
}

/**
 * Traverses the file system to get a list of all relevant files, respecting .gitignore.
 */
function getAllFiles(dirPath: string, ig: Ignore, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const relativePath = path.relative(ROOT_DIR, fullPath);

    if (ig.ignores(relativePath)) {
      continue;
    }

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, ig, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Uses the TypeScript compiler API to parse a file and extract its AST for import detection.
 * For non-TS/JS files (e.g., HTML), this will simply yield 0 imports and proceed.
 */
function analyzeCodeFile(filePath: string): FileAnalysis | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();

    const imports: string[] = [];

    // Only attempt AST parsing for TS/JS files; HTML (and others) skip this.
    if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
      const sourceFile = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true
      );

      function visit(node: ts.Node) {
        if (ts.isImportDeclaration(node)) {
          const importPath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '');
          imports.push(importPath);
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    return {
      path: path.relative(ROOT_DIR, filePath),
      imports,
      lineCount: fileContent.split('\n').length,
    };
  } catch (error) {
    console.warn(`Could not analyze file ${filePath}: ${error}`);
    return null;
  }
}

/**
 * Parses package.json to find external dependencies.
 */
function analyzePackageJson(): { [key: string]: string } {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return { ...packageJson.dependencies, ...packageJson.devDependencies };
  }
  return {};
}

/**
 * Builds a simple graph of internal module dependencies.
 */
function buildDependencyGraph(analyzedFiles: FileAnalysis[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const filePaths = new Set(analyzedFiles.map(f => f.path));

  for (const file of analyzedFiles) {
    graph.set(file.path, []);
    for (const imp of file.imports) {
      // Try to resolve relative imports only
      if (imp.startsWith('.')) {
        const resolvedPath = path.join(path.dirname(file.path), imp).replace(/\\/g, '/');
        const matchingFile = Array.from(filePaths).find(p => p.startsWith(resolvedPath));
        if (matchingFile) {
          graph.get(file.path)?.push(matchingFile);
        }
      }
    }
  }
  return graph;
}

/**
 * Converts the dependency graph to MermaidJS syntax.
 */
function generateMermaidGraph(graph: Map<string, string[]>): string {
  let mermaidString = 'graph TD;\n';
  for (const [file, imports] of graph.entries()) {
    if (imports.length > 0) {
      for (const imp of imports) {
        mermaidString += `    "${file}" --> "${imp}";\n`;
      }
    }
  }
  return mermaidString;
}

// --- Formatting and Synthesis Functions ---

/**
 * Format a file's content with whitespace-padded line numbers.
 * Example line format: "<line number> | <actual code of that line>"
 */
function formatWithLineNumbers(content: string): string {
  const lines = content.split(/\r?\n/);
  const width = Math.max(1, String(lines.length).length);
  return lines
    .map((line, idx) => `${String(idx + 1).padStart(width, ' ')} | ${line}`)
    .join('\n');
}

/**
 * Takes all analyzed data and formats it into the final llms-full.txt string.
 */
function formatContextFile(data: any): string {
  const { projectName, allFiles, analyzedFiles, externalDependencies, mermaidGraph } = data;
  const totalLoc = analyzedFiles.reduce((sum: number, f: FileAnalysis) => sum + f.lineCount, 0);

  // Layer 0: Project Identity & Executive Summary
  let content = `# ${projectName}\n\n`;
  content += `> This is an auto-generated FULL context file for the **${projectName}** codebase. In addition to the overview and dependency maps, it includes the full source of each file with line numbers to aid precise referencing.\n- **Language**: TypeScript/JavaScript/HTML\n- **Total Files**: ${allFiles.length}\n- **Total Source Files**: ${analyzedFiles.length}\n- **Total Lines of Code**: ~${totalLoc.toLocaleString()}\n- **External Dependencies**: ${Object.keys(externalDependencies).length}\n\n`;

  // Code listing format note
  content += `## Code listing format\n`;
  content += `Each file's source is shown with whitespace-padded line numbers.\n`;
  content += `Format: \n\n    <line number> | <actual code of that line>\n\n`;
  content += `Numbers are left-padded with spaces to match the number of digits in the file's total line count (e.g., in a 123-line file: "  1 | ...", " 10 | ...", "123 | ...").\n\n`;

  // Layer 1: Curated Guides & File Tree
  const docLinks = DOC_FILES.filter(f => fs.existsSync(path.join(ROOT_DIR, f)));
  if (docLinks.length > 0) {
    content += `## Key Documentation\n`;
    content += docLinks.map(f => `- [${f}](./${f})`).join('\n') + '\n\n';
  }

  content += `## File Tree\n`;
  content += "```\n" + generateFileTree(allFiles) + "\n```\n\n";

  // Layer 2: The Architectural Blueprint
  content += `## External Dependencies\n`;
  content += `| Library | Version |\n|---|---|\n`;
  for (const [name, version] of Object.entries(externalDependencies)) {
    content += `| ${name} | ${version} |\n`;
  }
  content += '\n';

  content += `## Internal Module Dependencies\n`;
  content += "```mermaid\n" + mermaidGraph + "\n```\n\n";

  // Layer 3: Full Source Listings per File
  content += `## Source Files (Full Listings)\n`;
  for (const file of analyzedFiles) {
    content += `### \`${file.path}\`\n\n`;
    content += `- **Lines of Code**: ${file.lineCount}\n`;
    content += `- **Imports**: ${file.imports.length} modules\n\n`;

    // Full source listing
    const absPath = path.join(ROOT_DIR, file.path);
    let fileContent = '';
    try {
      fileContent = fs.readFileSync(absPath, 'utf-8');
    } catch (e) {
      fileContent = `/* Failed to read file content: ${String(e)} */`;
    }
    const numbered = formatWithLineNumbers(fileContent);
    content += `#### Full Source\n`;
    content += "```\n" + numbered + "\n```\n\n";
  }

  return content;
}

function generateFileTree(filePaths: string[]): string {
  // A simplified file tree generator
  const tree: any = {};
  for (const filePath of filePaths) {
    const parts = path.relative(ROOT_DIR, filePath).split(path.sep);
    let currentLevel = tree;
    for (const part of parts) {
      currentLevel[part] = currentLevel[part] || {};
      currentLevel = currentLevel[part];
    }
  }

  function buildTreeString(subtree: any, indent: string = ''): string {
    let result = '';
    const entries = Object.keys(subtree).sort();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const isLast = i === entries.length - 1;
      result += `${indent}${isLast ? '└─' : '├─'} ${entry}\n`;
      result += buildTreeString(subtree[entry], `${indent}${isLast ? '   ' : '│  '}`);
    }
    return result;
  }
  return buildTreeString(tree);
}

// --- Execute Script ---

main().catch(error => {
  console.error('An error occurred during script execution:', error);
});
