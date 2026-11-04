import {writeFile} from 'node:fs/promises';
import {loadOgden} from '../src/ogden-content.ts';
import {expressionCoverage} from '../src/ogden-coverage.ts';
import {contentDigest} from '../src/ogden-readiness.ts';
const c=await loadOgden();const report={version:c.version,contentDigest:contentDigest(c),...expressionCoverage(c.items),evidence:'developer-self-check; independent human reviews and real-device acceptance are separate',tasks:c.items.filter(x=>x.kind==='expression').map(x=>({id:x.id,intentId:x.intentId,level:x.level,references:x.referenceCoverage}))};
if(process.argv.includes('--export'))await writeFile(new URL('../docs/ogden/expression-coverage.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,tasks:undefined},null,2));
