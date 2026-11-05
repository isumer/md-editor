// Language detection for highlight.js: pure, no imports, no I/O.

export const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  xml: 'xml',
  html: 'xml',
  xhtml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  xsd: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  css: 'css',
  md: 'markdown',
  markdown: 'markdown',
  diff: 'diff',
  patch: 'diff',
  rb: 'ruby',
  gemspec: 'ruby',
  rake: 'ruby',
  go: 'go',
  graphql: 'graphql',
  gql: 'graphql',
  ini: 'ini',
  toml: 'ini',
  java: 'java',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  kt: 'kotlin',
  kts: 'kotlin',
  less: 'less',
  lua: 'lua',
  mk: 'makefile',
  mak: 'makefile',
  pl: 'perl',
  pm: 'perl',
  m: 'objectivec',
  mm: 'objectivec',
  php: 'php',
  phtml: 'php-template',
  txt: 'plaintext',
  text: 'plaintext',
  py: 'python',
  pyw: 'python',
  repl: 'python-repl',
  pycon: 'python-repl',
  r: 'r',
  rs: 'rust',
  scss: 'scss',
  'sh-session': 'shell',
  console: 'shell',
  sql: 'sql',
  swift: 'swift',
  yaml: 'yaml',
  yml: 'yaml',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  vb: 'vbnet',
  wat: 'wasm',
  wast: 'wasm',
};

export function languageForPath(path: string): string | undefined {
  const segment = path.split(/[/\\]/).pop() ?? '';
  if (segment.toLowerCase() === 'makefile') {
    return 'makefile';
  }
  const dotIndex = segment.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === segment.length - 1) {
    return undefined;
  }
  const ext = segment.slice(dotIndex + 1).toLowerCase();
  return LANGUAGE_BY_EXTENSION[ext];
}
