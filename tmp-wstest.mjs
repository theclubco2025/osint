import fs from "node:fs";

const src = fs.readFileSync("server/lib/webSearch.ts","utf8");
console.log('file_has_duckduckgo', src.includes('duckduckgo'));
console.log('file_has_case', src.includes('case "duckduckgo"'));
console.log('env_provider', process.env.OSINT_SEARCH_PROVIDER);
console.log('eval_provider', String(process.env.OSINT_SEARCH_PROVIDER||'').trim().toLowerCase());

const m = await import('./server/lib/webSearch.ts');
const r = await m.webSearch('osint',{limit:3,timeoutMs:12000});
console.log('return_provider', r.provider, 'len', r.results.length);
