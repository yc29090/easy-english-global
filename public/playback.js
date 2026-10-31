/** One audio source at a time. Repeats start only after playback and a speaking gap. */
export function createPlayback(env = globalThis) {
 let generation = 0, audio = null, speech = null, timer = null;
 function stop() {
  generation++;
  if (timer !== null) env.clearTimeout(timer);
  timer = null;
  if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio = null; }
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
   const url = options.slow ? item.audio_slow : item.audio_normal;
   if (url && env.Audio) {
    audio = new env.Audio(url); audio.onended = ended; audio.onerror = failed;
    Promise.resolve(audio.play()).catch(failed);
   } else if (env.speechSynthesis && env.SpeechSynthesisUtterance) {
    speech = new env.SpeechSynthesisUtterance(item.english);
    speech.lang = 'en-US'; speech.rate = options.slow ? .65 : 1;
    speech.onend = ended; speech.onerror = failed;
    env.speechSynthesis.speak(speech);
   } else failed();
  }
  once();
 }
 return {play, stop};
}
