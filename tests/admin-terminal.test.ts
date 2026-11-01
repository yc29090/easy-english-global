import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const environmentHash=()=>createHash('sha256').update(JSON.stringify(Object.entries(process.env).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
function childEnvironment(extra:Record<string,string>={}){const env={...process.env,...extra};delete env.NODE_TEST_CONTEXT;return env;}
import {readFileSync} from 'node:fs';
import {adminConnectionOptions,adminErrorMessage,AdminInputError} from '../src/admin-terminal.ts';
import {HttpError} from '../src/security.ts';
test('admin connection uses explicit input and enforces production TLS without changing the environment',()=>{
 const before=environmentHash();
 const options=adminConnectionOptions('postgres://test_owner:synthetic-not-a-real-credential@db.example.com/test?sslmode=disable');
 assert.ok(options.ssl);assert.equal(options.ssl.rejectUnauthorized,true);assert.ok(!options.connectionString.includes('sslmode'));assert.equal(environmentHash(),before,'CLI configuration must not change environment variables');
 assert.throws(()=>adminConnectionOptions('not a connection string'));
});
test('admin CLI rejects redirected input even when legacy credential variables are present',()=>{
 const result=spawnSync(process.execPath,['scripts/admin.ts'],{cwd:new URL('..',import.meta.url),encoding:'utf8',input:'ignored-pipe-input',env:childEnvironment({ADMIN_EMAIL:'ignored-environment-input',ADMIN_PASSWORD:'ignored-environment-input',DATABASE_URL:'ignored-environment-input'})});
 assert.equal(result.status,1);const output=result.stdout+result.stderr;assert.ok(!output.includes('ignored-environment-input'));assert.ok(!output.includes('ignored-pipe-input'));
});
test('admin CLI rejects arguments and does not load dotenv',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.scripts['admin:create'],'node scripts/admin.ts');
 const result=spawnSync(process.execPath,['scripts/admin.ts','not-a-valid-credential-argument'],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:childEnvironment()});
 assert.equal(result.status,1);assert.ok(!(result.stdout+result.stderr).includes('not-a-valid-credential-argument'));
});
test('driver errors and unexpected validation errors are never printed verbatim',()=>{
 const sentinel='SENSITIVE_INPUT_MUST_NOT_BE_OUTPUT';
 for(const error of [new Error(sentinel),new HttpError(400,sentinel),new HttpError(409,sentinel),new AdminInputError('cancelled'),new AdminInputError('mismatch')])assert.ok(!adminErrorMessage(error).includes(sentinel));
});

test('admin login check rejects credentials in arguments, pipes and environment and never loads dotenv',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));assert.equal(pkg.scripts['admin:check'],'node scripts/admin-check.ts');
 for(const args of [[],['ignored-check-argument']]){
  const result=spawnSync(process.execPath,['scripts/admin-check.ts',...args],{cwd:new URL('..',import.meta.url),encoding:'utf8',input:'ignored-check-pipe',env:childEnvironment({ADMIN_PASSWORD:'ignored-check-environment',DATABASE_URL:'ignored-check-environment'})});
  assert.equal(result.status,1);const output=result.stdout+result.stderr;assert.match(output,/交互终端/);assert.doesNotMatch(output,/ignored-check-/);
 }
});
