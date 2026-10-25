// Read-only audit of translation data. Does NOT modify anything.
const fs = require('fs');
const src = fs.readFileSync('/app/frontend/src/i18n.tsx', 'utf8');
const start = src.indexOf('const T: Record<Lang, Record<string, string>> = ') + 'const T: Record<Lang, Record<string, string>> = '.length;
const end = src.indexOf('\ntype Ctx');
let body = src.slice(start, end).trim().replace(/;\s*$/, '');
const T = eval('(' + body + ')');
const GEN = JSON.parse(fs.readFileSync('/app/frontend/src/i18n-generated.json', 'utf8'));
const LANGS = ['ar','en','ur','fa','he','es','fr','de','it','pt','ru','tr','zh','ja','ko','hi','bn','id','ms','th'];

const SCRIPT = {
  ar: /[\u0600-\u06FF]/, ur: /[\u0600-\u06FF]/, fa: /[\u0600-\u06FF]/, he: /[\u0590-\u05FF]/,
  ru: /[\u0400-\u04FF]/, zh: /[\u4E00-\u9FFF]/, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/,
  hi: /[\u0900-\u097F]/, bn: /[\u0980-\u09FF]/, th: /[\u0E00-\u0E7F]/,
};
const LATIN = ['en','es','fr','de','it','pt','tr','id','ms'];
const ARABIC = /[\u0600-\u06FF]/;
const FOREIGN_SCRIPTS = { he: /[\u0590-\u05FF]/, cyr: /[\u0400-\u04FF]/, cjk: /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/, dev: /[\u0900-\u097F]/, ben: /[\u0980-\u09FF]/, thai: /[\u0E00-\u0E7F]/, arab: /[\u0600-\u06FF]/ };
const ph = s => (String(s).match(/\{[a-zA-Z_]+\}/g) || []).sort().join(',');
const letters = s => String(s).replace(/[\s\d\p{P}\p{S}]/gu, '');

function wrongScript(lang, v) {
  const out = [];
  for (const [name, re] of Object.entries(FOREIGN_SCRIPTS)) {
    if (!re.test(v)) continue;
    const own = SCRIPT[lang];
    if (own && own.source === re.source) continue;
    if (lang === 'ja' && name === 'cjk') continue;
    if ((lang === 'zh' || lang === 'ko') && name === 'cjk') continue;
    out.push(name);
  }
  return out;
}

const report = { static: {}, generated: {} };
const arKeys = Object.keys(T.ar), enKeys = Object.keys(T.en);
const allKeys = [...new Set([...arKeys, ...enKeys])];
for (const L of LANGS) {
  const d = T[L] || {};
  const r = { total: Object.keys(d).length, missing: [], sameAsEnglish: [], wrongScript: [], noNativeScript: [], placeholderMismatch: [], literalBackslashN: [], empty: [] };
  for (const k of allKeys) {
    const v = d[k];
    if (v === undefined) { r.missing.push(k); continue; }
    if (!String(v).trim()) r.empty.push(k);
    const en = T.en[k];
    if (L !== 'en' && L !== 'ar' && en && v === en && letters(en).length > 3) r.sameAsEnglish.push(`${k} = ${v}`);
    const ws = wrongScript(L, v); if (ws.length) r.wrongScript.push(`${k} [${ws}] = ${v}`);
    if (SCRIPT[L] && !SCRIPT[L].test(v) && letters(v).length > 3 && !/Zenrex|POS|SAR/.test(v)) r.noNativeScript.push(`${k} = ${v}`);
    const ref = T.ar[k] ?? en;
    if (ref !== undefined && ph(ref) !== ph(v)) r.placeholderMismatch.push(`${k}: ref(${ph(ref)}) got(${ph(v)}) = ${v}`);
    if (String(v).includes('\\n')) r.literalBackslashN.push(`${k} = ${v}`);
  }
  report.static[L] = r;
}
// keys that exist in non-ar dictionaries but not in ar/en (orphans)
report.staticOrphans = {};
for (const L of LANGS) report.staticOrphans[L] = Object.keys(T[L] || {}).filter(k => !allKeys.includes(k));

const genKeys = Object.keys(GEN);
for (const L of LANGS.filter(l => l !== 'ar')) {
  const r = { total: genKeys.length, missing: [], untranslatedArabicKept: [], wrongScript: [], sameAsEnglish: [], noNativeScript: [], placeholderMismatch: [], suspiciousLength: [], empty: [] };
  for (const src of genKeys) {
    const v = GEN[src][L];
    if (v === undefined || v === null) { r.missing.push(src); continue; }
    if (!String(v).trim()) { r.empty.push(src); continue; }
    if (v === src && letters(src).length > 1) r.untranslatedArabicKept.push(src);
    else {
      const ws = wrongScript(L, v); if (ws.length) r.wrongScript.push(`${src} → [${ws}] ${v}`);
    }
    const en = GEN[src].en;
    if (L !== 'en' && en && v === en && letters(en).length > 3 && !/^[A-Z0-9 .\-/+]+$/.test(en)) r.sameAsEnglish.push(`${src} → ${v}`);
    if (SCRIPT[L] && !SCRIPT[L].test(v) && letters(v).length > 3) r.noNativeScript.push(`${src} → ${v}`);
    if (ph(src) !== ph(v)) r.placeholderMismatch.push(`${src} → ${v}`);
    const ratio = letters(v).length / Math.max(1, letters(src).length);
    if (letters(src).length >= 4 && (ratio > 6 || (ratio < 0.15 && !['zh','ja','ko'].includes(L)))) r.suspiciousLength.push(`${src} → ${v}`);
  }
  report.generated[L] = r;
}
fs.writeFileSync('/tmp/i18n_audit.json', JSON.stringify(report, null, 1));
console.log('STATIC (keys in ar/en union =', allKeys.length, ')');
console.log('lang total missing sameEN wrongScript noNative phMismatch \\n orphans');
for (const L of LANGS) { const r = report.static[L]; console.log(L, r.total, r.missing.length, r.sameAsEnglish.length, r.wrongScript.length, r.noNativeScript.length, r.placeholderMismatch.length, r.literalBackslashN.length, report.staticOrphans[L].length); }
console.log('\nGENERATED (source strings =', genKeys.length, ')');
console.log('lang missing keptArabic wrongScript sameEN noNative phMismatch suspLen empty');
for (const L of Object.keys(report.generated)) { const r = report.generated[L]; console.log(L, r.missing.length, r.untranslatedArabicKept.length, r.wrongScript.length, r.sameAsEnglish.length, r.noNativeScript.length, r.placeholderMismatch.length, r.suspiciousLength.length, r.empty.length); }
