// Run with npm run test:i18n. Uses the project's existing TypeScript compiler.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function loadTs(file) {
  const full = path.resolve(root, file.endsWith('.ts') ? file : file + '.ts');
  if (cache.has(full)) return cache.get(full).exports;
  const output = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  cache.set(full, module);
  const localRequire = (specifier) => specifier.startsWith('.')
    ? loadTs(path.resolve(path.dirname(full), specifier)) : require(specifier);
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}
const core = loadTs('src/i18n/core');
const reports = loadTs('src/i18n/reports');
const detections = loadTs('src/i18n/detections');
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const thai = /[\u0e00-\u0e7f]/;

assert.deepEqual(Object.keys(core.catalogs.en).sort(), Object.keys(core.catalogs.th).sort());
for (const [key, english] of Object.entries(core.catalogs.en)) {
  assert.ok(english.trim(), `Empty English translation: ${key}`);
  assert.ok(!thai.test(english), `Thai text in English catalog: ${key}`);
  assert.deepEqual(placeholders(english), placeholders(core.catalogs.th[key]), `Placeholder mismatch: ${key}`);
  const params = Object.fromEntries(placeholders(english).map((name) => [name, 123]));
  assert.ok(!/\{\w+\}/.test(core.translate('en', key, params)), `Unresolved parameter: ${key}`);
}

const oldReports = [{ id: 'legacy', type: 'ทางมืด', severity: 'สูง', description: 'ข้อความที่ผู้ใช้เขียน', coordinates: { latitude: 0, longitude: 0 }, createdAt: '2026-01-01' }];
const migrated = reports.migrateReports(oldReports);
assert.equal(migrated[0].type, 'poor_lighting');
assert.equal(migrated[0].severity, 'high');
assert.equal(migrated[0].description, oldReports[0].description);
assert.equal(oldReports[0].type, 'ทางมืด', 'Migration must not mutate its input');
assert.deepEqual(reports.migrateReports(migrated), migrated, 'Migration must be idempotent');

let updates = 0;
const unsubscribe = core.subscribeLanguage(() => updates++);
core.applyLanguage('en');
assert.equal(core.getLocale(), 'en-US');
assert.equal(reports.issueLabel(migrated[0].type), 'Poor lighting');
assert.equal(reports.severityLabel(migrated[0].severity), 'High');
assert.equal(detections.detectionPosition('ซ้าย'), 'on your left');
assert.equal(detections.detectionPosition('right'), 'on your right');
assert.equal(detections.detectionPosition('ตรงหน้า'), 'ahead');
const retainedNotice = core.message('home.noFoundNearby', { value0: core.message('home.ramps') });
assert.ok(!thai.test(core.renderMessage(retainedNotice)));
const savedError = new core.LocalizedError(core.message('service.aiServerReturnedStatus', { value0: 503 }));
assert.match(core.renderMessage(savedError.localizedMessage), /503/);
core.applyLanguage('th');
assert.equal(core.getLocale(), 'th-TH');
assert.equal(reports.issueLabel(migrated[0].type), 'ทางมืด');
assert.ok(thai.test(core.renderMessage(savedError.localizedMessage)), 'Existing errors must change language');
assert.ok(thai.test(core.renderMessage(retainedNotice)), 'Nested category labels must follow the current language');
assert.equal(updates, 2);
unsubscribe();
assert.equal(core.isLanguage('fr'), false);
assert.equal(core.isLanguage(null), false);

// Catch new hardcoded Thai UI text before it bypasses the translation system.
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'i18n') scan(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        assert.ok(!thai.test(node.text), `Hardcoded Thai outside i18n: ${path.relative(root, file)}:${parsed.getLineAndCharacterOfPosition(node.getStart(parsed)).line + 1}`);
      }
      ts.forEachChild(node, visit);
    }
    visit(parsed);
  }
}
scan(path.join(root, 'src'));
console.log(`Passed: ${Object.keys(core.catalogs.en).length} translation pairs, parameters, live locale changes, errors, report migration, AI directions, and hardcoded-text scan.`);
