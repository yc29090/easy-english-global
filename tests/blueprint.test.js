import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'yaml';
test('Render Blueprint uses a free Node service, runtime setup, health checks and manual secrets',()=>{
 const blueprint=parse(readFileSync(new URL('../render.yaml',import.meta.url),'utf8'));
 const service=blueprint.services[0];assert.equal(service.type,'web');assert.equal(service.runtime,'node');assert.equal(service.plan,'free');assert.equal(service.branch,'main');assert.equal(service.startCommand,'npm run start:render');assert.equal(service.healthCheckPath,'/health');assert.equal(service.autoDeployTrigger,'checksPass');assert.equal(service.preDeployCommand,undefined);assert.equal(blueprint.databases,undefined);
 const variables=Object.fromEntries(service.envVars.map(v=>[v.key,v]));assert.equal(variables.NODE_ENV.value,'production');assert.equal(variables.ALLOW_MOCK_CHECKOUT.value,'false');assert.equal(variables.DATABASE_SSL.value,'verify-full');for(const key of ['DATABASE_URL','RESEND_API_KEY','MAIL_FROM']){assert.equal(variables[key].sync,false);assert.equal(variables[key].value,undefined);}
 assert.equal(variables.ADMIN_PASSWORD,undefined);assert.equal(variables.ADMIN_EMAIL,undefined);
 const example=readFileSync(new URL('../.env.example',import.meta.url),'utf8');assert.match(example,/^DATABASE_URL=$/m);assert.doesNotMatch(example,/^ADMIN_PASSWORD=.+/m);
});
