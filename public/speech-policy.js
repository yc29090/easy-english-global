/** Accent/rate policy only. Each version owns its playback lifecycle. */
export const ENGLISH_SPEECH_RATES=Object.freeze({normal:1,slow:0.55});
export const speechLocale=voice=>String(voice?.lang||'').trim().replace(/_/g,'-').toLowerCase();
export const isUsEnglish=voice=>speechLocale(voice)==='en-us';
export const voiceSourceRank=voice=>voice.localService===true?0:voice.localService===false?2:1;
export function voiceLabel(voice){
 const source=voice.localService===true?'本地英语语音':voice.localService===false?'浏览器在线英语语音':'浏览器英语语音（来源由浏览器决定）';
 return `${source}：${voice.name||voice.lang} · ${voice.lang}`;
}
