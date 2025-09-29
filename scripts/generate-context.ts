// generate-context.ts
// A script to perform static analysis on a TypeScript/JavaScript codebase
// and generate a comprehensive `llms.txt` context file for Large Language Models.
//
// Based on the blueprint for Synthesized Static Context (SSC) files.
//
// Prerequisites: pnpm install -D typescript ignore
// Usage:         pnpx tsx scripts/generate-context.ts

import * as fs from 'fs'
import * as path from 'path'
import * as ts from 'typescript'
import { Ignore } from 'ignore'
import ignore from 'ignore'

// --- Configuration ---
const ROOT_DIR = process.cwd()
const OUTPUT_FILE = path.join(ROOT_DIR, 'llms.txt')
const SRC_DIRECTORIES = ['src'] // Primary directories to scan for source code
const FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.html']
const DOC_FILES = ['README.md', 'CONTRIBUTING.md']
const CODE_SNIPPET_LINE_THRESHOLD = 30 // Min lines for a function to be included as a snippet

interface SymbolInfo {
  name: string
  type: 'Function' | 'Class' | 'Interface' | 'Variable'
  docstring: string
  startLine: number
  endLine: number
  code: string
}

interface FileAnalysis {
  path: string
  imports: string[]
  symbols: SymbolInfo[]
  lineCount: number
}

interface ContextData {
  projectName: string
  allFiles: string[]
  analyzedFiles: FileAnalysis[]
  externalDependencies: Record<string, string>
  mermaidGraph: string
}

interface FileTree {
  [key: string]: FileTree
}

// --- Main Orchestrator ---

async function main() {
  console.log('🤖 Starting codebase analysis...')

  // Layer 0 & 1: Project Identity and File Structure
  const projectName = path.basename(ROOT_DIR)
  const gitignore = getGitignorePatterns()
  const allFiles = getAllFiles(ROOT_DIR, gitignore)

  // Layer 2 & 3: Deep Analysis
  console.log(`Analyzing ${allFiles.length} files...`)
  const analyzedFiles: FileAnalysis[] = []
  for (const file of allFiles) {
    if (FILE_EXTENSIONS.includes(path.extname(file))) {
      const analysis = analyzeCodeFile(file)
      if (analysis) {
        analyzedFiles.push(analysis)
      }
    }
  }

  const externalDependencies = analyzePackageJson()
  const dependencyGraph = buildDependencyGraph(analyzedFiles)
  const mermaidGraph = generateMermaidGraph(dependencyGraph)

  // Synthesize the final context file
  console.log(' Synthesizing context file...')
  const contextContent = formatContextFile({
    projectName,
    allFiles,
    analyzedFiles,
    externalDependencies,
    mermaidGraph,
  })

  fs.writeFileSync(OUTPUT_FILE, contextContent)
  console.log(`✅ Successfully generated context file at ${OUTPUT_FILE}`)
}

// --- Analysis Functions ---

/**
 * Reads and parses the .gitignore file.
 */
function getGitignorePatterns(): Ignore {
  const ig = ignore()
  const gitignorePath = path.join(ROOT_DIR, '.gitignore')
  if (fs.existsSync(gitignorePath)) {
    ig.add(fs.readFileSync(gitignorePath).toString())
  }
  // Add common ignores that might not be in .gitignore
  ig.add([
    'node_modules', '.git', 'dist', 'build', '*.log', 'llms.txt',
    '.*', 'docs',
    'eslint.config.mjs', 'scripts/*',
    'justfile',
    'pdf-*.html',
    '*-legacy.*',
  ])
  return ig
}

/**
 * Traverses the file system to get a list of all relevant files, respecting .gitignore.
 */
function getAllFiles(dirPath: string, ig: Ignore, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dirPath)

  for (const file of files) {
    const fullPath = path.join(dirPath, file)
    const relativePath = path.relative(ROOT_DIR, fullPath)

    if (ig.ignores(relativePath)) {
      continue
    }

    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, ig, fileList)
    } else {
      fileList.push(fullPath)
    }
  }
  return fileList
}

/**
 * Uses the TypeScript compiler API to parse a file and extract its AST.
 */
function analyzeCodeFile(filePath: string): FileAnalysis | null {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const sourceFile = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.Latest,
      true,
    )

    const imports: string[] = []
    const symbols: SymbolInfo[] = []

    function visit(node: ts.Node) {
      // Extract Imports
      if (ts.isImportDeclaration(node)) {
        const importPath = node.moduleSpecifier.getText(sourceFile).replace(/['"]/g, '')
        imports.push(importPath)
      }

      // Extract Functions, Classes, etc.
      if (
        ts.isFunctionDeclaration(node)
        || ts.isClassDeclaration(node)
        || ts.isInterfaceDeclaration(node)
        || ts.isVariableStatement(node)
      ) {
        let name = ''
        let type: SymbolInfo['type'] = 'Variable'
        if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) {
          name = node.name?.getText(sourceFile) || '[Anonymous]'
          if (ts.isFunctionDeclaration(node)) type = 'Function'
          if (ts.isClassDeclaration(node)) type = 'Class'
          if (ts.isInterfaceDeclaration(node)) type = 'Interface'
        } else if (ts.isVariableStatement(node)) {
          name = node.declarationList.declarations[0].name.getText(sourceFile)
        }

        if (name) {
          const docstring = getJsDoc(node)
          const startLine = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          const endLine = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1
          const code = node.getText(sourceFile)
          symbols.push({ name, type, docstring, startLine, endLine, code })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)

    return {
      path: path.relative(ROOT_DIR, filePath),
      imports,
      symbols,
      lineCount: fileContent.split('\n').length,
    }
  } catch (error) {
    console.warn(`Could not analyze file ${filePath}: ${error}`)
    return null
  }
}

function getJsDoc(node: ts.Node): string {
  const comments = ts.getJSDocCommentsAndTags(node)
  if (comments.length > 0) {
    return comments.map((c) => c.comment || '').join('\n').trim()
  }
  return ''
}

/**
 * Parses package.json to find external dependencies.
 */
function analyzePackageJson(): Record<string, string> {
  const packageJsonPath = path.join(ROOT_DIR, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
    return { ...packageJson.dependencies, ...packageJson.devDependencies }
  }
  return {}
}

/**
 * Builds a simple graph of internal module dependencies.
 */
function buildDependencyGraph(analyzedFiles: FileAnalysis[]): Map<string, string[]> {
  const graph = new Map<string, string[]>()
  const filePaths = new Set(analyzedFiles.map((f) => f.path))

  for (const file of analyzedFiles) {
    graph.set(file.path, [])
    for (const imp of file.imports) {
      // Try to resolve relative imports
      const resolvedPath = path.join(path.dirname(file.path), imp).replace(/\\/g, '/')
      // Find the corresponding full path from our list of analyzed files
      const matchingFile = Array.from(filePaths).find((p) => p.startsWith(resolvedPath))
      if (matchingFile) {
        graph.get(file.path)?.push(matchingFile)
      }
    }
  }
  return graph
}

/**
 * Converts the dependency graph to MermaidJS syntax.
 */
function generateMermaidGraph(graph: Map<string, string[]>): string {
  let mermaidString = 'graph TD;\n'
  for (const [file, imports] of graph.entries()) {
    if (imports.length > 0) {
      for (const imp of imports) {
        mermaidString += `    "${file}" --> "${imp}";\n`
      }
    }
  }
  return mermaidString
}

// --- Formatting and Synthesis Functions ---

/**
 * Takes all analyzed data and formats it into the final llms.txt string.
 */
function formatContextFile(data: ContextData): string {
  const { projectName, allFiles, analyzedFiles, externalDependencies, mermaidGraph } = data
  const totalLoc = analyzedFiles.reduce((sum: number, f: FileAnalysis) => sum + f.lineCount, 0)

  // Layer 0: Project Identity & Executive Summary
  let content = `# ${projectName}\n\n`
  content += `> This is an auto-generated context file for the **${projectName}** codebase. It provides a high-level overview of the project structure, dependencies, and key components to assist Large Language Models in understanding the code.
- **Language**: TypeScript/JavaScript
- **Total Files**: ${allFiles.length}
- **Total Source Files**: ${analyzedFiles.length}
- **Total Lines of Code**: ~${totalLoc.toLocaleString()}
- **External Dependencies**: ${Object.keys(externalDependencies).length}\n\n`

  // Layer 1: Curated Guides & File Tree
  const docLinks = DOC_FILES.filter((f) => fs.existsSync(path.join(ROOT_DIR, f)))
  if (docLinks.length > 0) {
    content += `## Key Documentation\n`
    content += docLinks.map((f) => `- [${f}](./${f})`).join('\n') + '\n\n'
  }

  content += `## File Tree\n`
  content += '```\n' + generateFileTree(allFiles) + '\n```\n\n'

  // Layer 2: The Architectural Blueprint
  content += `## External Dependencies\n`
  content += `| Library | Version |\n|---|---|\n`
  for (const [name, version] of Object.entries(externalDependencies)) {
    content += `| ${name} | ${version} |\n`
  }
  content += '\n'

  content += `## Internal Module Dependencies\n`
  content += '```mermaid\n' + mermaidGraph + '\n```\n\n'

  // Layer 3: Granular Code & Relational Maps
  content += `## Source Code Analysis\n`
  for (const file of analyzedFiles) {
    content += `### \`${file.path}\`\n\n`
    content += `- **Lines of Code**: ${file.lineCount}\n`
    content += `- **Imports**: ${file.imports.length} modules\n\n`

    if (file.symbols.length > 0) {
      content += `#### Key Symbols\n`
      content += `| Type | Name | Docstring | Lines |\n`
      content += `|---|---|---|---|\n`
      for (const symbol of file.symbols) {
        const docstringSnippet = symbol.docstring.split('\n')[0] || 'N/A'
        content += `| ${symbol.type} | \`${symbol.name}\` | ${docstringSnippet} | ${symbol.startLine}-${symbol.endLine} |\n`
      }
      content += '\n'

      const importantFunctions = file.symbols.filter((s: SymbolInfo) => s.type === 'Function' && (s.endLine - s.startLine) > CODE_SNIPPET_LINE_THRESHOLD)
      if (importantFunctions.length > 0) {
        content += `#### Important Code Snippets\n`
        for (const func of importantFunctions) {
          content += `**Function: \`${func.name}\`**\n`
          content += '```typescript\n' + func.code + '\n```\n\n'
        }
      }
    }
  }

  return content
}

function generateFileTree(filePaths: string[]): string {
  // A simplified file tree generator
  const tree: FileTree = {}
  for (const filePath of filePaths) {
    const parts = path.relative(ROOT_DIR, filePath).split(path.sep)
    let currentLevel: FileTree = tree
    for (const part of parts) {
      currentLevel[part] = currentLevel[part] || ({} as FileTree)
      currentLevel = currentLevel[part]
    }
  }

  function buildTreeString(subtree: FileTree, indent = ''): string {
    let result = ''
    const entries = Object.keys(subtree).sort()
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const isLast = i === entries.length - 1
      result += `${indent}${isLast ? '└─' : '├─'} ${entry}\n`
      result += buildTreeString(subtree[entry], `${indent}${isLast ? '   ' : '│  '}`)
    }
    return result
  }
  return buildTreeString(tree)
}

// --- Execute Script ---

main().catch((error) => {
  console.error('An error occurred during script execution:', error)
})
