import {loadOgden} from '../src/ogden-content.ts';
const c=await loadOgden();console.log(JSON.stringify({version:c.version,target:c.targetCoreCount,items:c.items.length,words:c.items.filter(x=>x.kind==='word').length,approved:c.items.filter(x=>x.reviewStatus==='approved').length,originalVerification:'pending-primary-review'}));
