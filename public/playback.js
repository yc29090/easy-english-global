export const PLAYBACK_RATES=Object.freeze({normal:1,slow:0.55});
/** One audio source at a time. Repeats start only after playback and a speaking gap. */
export function createPlayback(env = globalThis) {
 let generation = 0, audio = null, speech = null, timer = null, voices=[];
 function loadVoices(){try{voices=env.speechSynthesis?.getVoices?.()||[];}catch{voices=[];}}
 // Loading the voice list is silent; it does not start speech or request a microphone.
 loadVoices();env.speechSynthesis?.addEventListener?.('voiceschanged',loadVoices);
 function stop() {
  generation++;
  if (timer !== null) env.clearTimeout(timer);
  timer = null;
  if (audio) { audio.onended = null; audio.onerror = null; audio.onloadedmetadata = null; audio.pause(); audio = null; }
  if (speech && env.speechSynthesis) env.speechSynthesis.cancel();
  speech = null;
 }
 function play(item, options = {}) {
  stop();
  const active = generation;
  const current = () => active === generation;
  const phase = text => { if (current()) options.onPhase?.(text); };
  const failed = () => { if (current()) { stop(); options.onError?.(); } };
  const ended = () => {
   if (!current()) return;
   if (options.shadow) phase('speak');
   else phase(options.repeat ? 'pause' : 'done');
   if (options.repeat) {
    const gap = options.shadow ? Math.max(3000, item.english.split(/\s+/).length * 850) : 1500;
    timer = env.setTimeout(once, gap);
   }
  };
  function once() {
   if (!current()) return;
   phase('listen');
   const url = options.slow ? (item.audio_slow || item.audio_normal) : item.audio_normal;
   const rate=options.slow?PLAYBACK_RATES.slow:PLAYBACK_RATES.normal;
   if (url && env.Audio) {
    audio = new env.Audio(url); audio.onended = ended; audio.onerror = failed;
    const clip=audio,mediaRate=options.slow&&(!item.audio_slow||item.audio_slow===item.audio_normal)?rate:1;
    const applyRate=()=>{if(!current())return;clip.defaultPlaybackRate=mediaRate;clip.playbackRate=mediaRate;for(const key of ['preservesPitch','webkitPreservesPitch','mozPreservesPitch'])if(key in clip)clip[key]=true;};
    applyRate();clip.onloadedmetadata=applyRate;
    Promise.resolve(audio.play()).catch(failed);
   } else if (env.speechSynthesis && env.SpeechSynthesisUtterance) {
    speech = new env.SpeechSynthesisUtterance(item.english);
    loadVoices();
    const english=voices.filter(v=>/^en(?:[-_]|$)/i.test(v.lang));
    const voice=english.find(v=>v.localService)||english.find(v=>v.default)||english[0];
    if(voice)speech.voice=voice;
    speech.lang=voice?.lang||'en-US';speech.rate=rate;speech.pitch=1;speech.volume=1;
    if(env.speechSynthesis.paused)env.speechSynthesis.resume?.();
    speech.onend = ended; speech.onerror = failed;
    env.speechSynthesis.speak(speech);
   } else failed();
  }
  once();
 }
 return {play, stop};
}
