/** Opt-in encoding for the large, fixed curriculum catalog only; never changes 1.0 responses. */
export function acceptsOgdenGzip(header:string|undefined){
 return (header||'').split(',').some(part=>{const [encoding,...parameters]=part.trim().toLowerCase().split(';');if(encoding!=='gzip')return false;const quality=parameters.find(p=>p.trim().startsWith('q='));if(!quality)return true;const q=Number(quality.trim().slice(2));return Number.isFinite(q)&&q>0&&q<=1;});
}
