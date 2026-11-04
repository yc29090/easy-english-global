import {loadOgden} from '../src/ogden-content.ts';
import {readFile} from 'node:fs/promises';
const c=await loadOgden(),index=JSON.parse(await readFile(new URL('../data/ogden/historical-index.json',import.meta.url),'utf8'));
const canonical=(word:string)=>({gray:'grey',plow:'plough'}[word.toLowerCase()]||word.toLowerCase());
if(index.entries.length!==850||new Set(index.entries).size!==850)throw new Error('Historical index must contain 850 distinct conceptual entries');
if(Object.keys(index.categories).length!==850||index.entries.some((w:string)=>!index.categories[w]))throw new Error('Missing historical classification');
for(const w of c.items.filter(x=>x.kind==='word'))if(w.isOgdenOriginal!==index.entries.includes(canonical(w.english)))throw new Error('Incorrect historical membership: '+w.id);
console.log(JSON.stringify({version:c.version,target:c.targetCoreCount,items:c.items.length,words:c.items.filter(x=>x.kind==='word').length,authoredVariants:c.items.reduce((n,x)=>n+(x.variants?.length||0),0),developerSelfChecked:c.items.filter(x=>x.reviewMethod==='developer-self-check'&&x.reviewStatus==='approved').length,originalVerification:'scholarly-reprint-cross-checked',historicalIndex:index.entries.length,notCompleteModern850:true}));
