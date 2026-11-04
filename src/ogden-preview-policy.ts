import {isIP} from 'node:net';
import {HttpError} from './security.ts';
/** This policy is only installed by the explicit ephemeral preview runner. */
export function localPreviewHost(host:string){
 if(host==='localhost'||host==='127.0.0.1')return true;
 if(isIP(host)!==4)return false;
 const [a,b]=host.split('.').map(Number);return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}
export function previewSettings(env:Record<string,string|undefined>){
 if(env.NODE_ENV==='production')throw Error('Isolated preview cannot run in production');
 const host=env.OGDEN_PREVIEW_HOST||'127.0.0.1',port=Number(env.OGDEN_PREVIEW_PORT||3100);
 if(!localPreviewHost(host)||!Number.isInteger(port)||port<1024||port>65535)throw Error('Preview requires loopback or an explicit private IPv4 address and a valid local port');
 return {host,port,appUrl:`http://${host}:${port}`};
}
export function assertPreviewConfiguration(config:{production:boolean;appUrl:string;mockCheckout:boolean;manualPayment?:boolean;mailProvider:string;gmail?:unknown}){
 const origin=new URL(config.appUrl);
 if(config.production||config.mockCheckout||config.manualPayment||config.mailProvider!=='disabled'||config.gmail||origin.protocol!=='http:'||!localPreviewHost(origin.hostname)||origin.origin!==config.appUrl)throw Error('Isolated preview configuration rejected');
}
export function guardPreviewRequest(path:string,method:string,host:string|undefined,origin:string,body?:any){
 if(host!==new URL(origin).host)throw new HttpError(403,'Preview host rejected');
 if(/^\/api\/(orders|admin|payments|gmail)(\/|$)/.test(path)||path.startsWith('/payments/')||/^\/api\/auth\/(forgot|reset|password)$/.test(path))throw new HttpError(403,'隔离预览不提供支付、订单、管理员或邮件功能');
 const auth=['/api/auth/register','/api/auth/login','/api/auth/logout','/api/me'];
 if(path.startsWith('/api/')&&!auth.includes(path)&&!path.startsWith('/api/ogden/')&&!(path==='/api/progress'&&method==='GET'))throw new HttpError(404,'Preview endpoint not found');
 if(body&&method==='POST'&&['/api/auth/register','/api/auth/login'].includes(path)&&!(typeof body.email==='string'&&/^[a-z0-9._+-]+@example\.invalid$/i.test(body.email)))throw new HttpError(400,'仅使用 @example.invalid 测试邮箱，禁止输入真实账号或密码');
}
export const PREVIEW_BANNER='<aside role="note"><strong>【隔离测试环境】仅使用虚构账号和测试密码；没有真实支付。所有测试数据在停止进程后清空。请勿输入任何生产凭据。</strong></aside>';
