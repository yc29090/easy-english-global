import {requestId,ogdenRequest} from './requests.js';
const $=s=>document.querySelector(s);
function fresh(){try{$('#email').value='test-'+requestId().slice(0,12)+'@example.invalid';$('#password').value='Preview9!'+requestId().slice(0,12);}catch(e){$('#feedback').textContent=e.message;}}
fresh();
async function submit(action){
 const buttons=document.querySelectorAll('button');buttons.forEach(b=>b.disabled=true);
 try{const email=$('#email').value;if(!/^[a-z0-9._+-]+@example\.invalid$/i.test(email))throw Error('仅允许 @example.invalid 测试邮箱。');await ogdenRequest('/auth/'+action,'POST',{email,password:$('#password').value});location.href='/ogden';}
 catch(e){$('#feedback').textContent=e.message;}finally{buttons.forEach(b=>b.disabled=false);}
}
$('#preview-login').onsubmit=e=>{e.preventDefault();void submit('register');};$('#login').onclick=()=>submit('login');

$('#new-account').onclick=()=>{fresh();$('#feedback').textContent='已生成虚构测试账号；需要创建后才能使用。';};
$('#logout').onclick=async()=>{try{await ogdenRequest('/auth/logout','POST',{});$('#feedback').textContent='已退出测试账号。';}catch(e){$('#feedback').textContent=e.status===401?'当前没有有效测试会话。':e.message;}};
