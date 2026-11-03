import type {Curriculum} from './content.ts';
/** Explicit forms only: never substring search or heuristic stemming. */
export const wordForms:Record<string,string[]>={
 be:['am','is','are','was','were','been','being'],i:['me'],we:['us'],they:['them'],he:['him'],she:['her'],this:['these'],that:['those'],
 have:['has','had','having'],do:['does','did','done','doing'],can:['could'],go:['goes','going','went','gone'],come:['comes','coming','came'],
 live:['lives','lived','living'],work:['works','worked','working'],need:['needs','needed','needing'],want:['wants','wanted','wanting'],
 like:['likes','liked','liking'],cook:['cooks','cooked','cooking'],finish:['finishes','finished','finishing'],close:['closes','closed','closing'],
 charge:['charges','charged','charging'],delay:['delays','delayed','delaying'],stay:['stays','stayed','staying'],hurt:['hurts','hurting'],
 speak:['speaks','spoke','spoken','speaking'],read:['reads','reading'],write:['writes','wrote','written','writing'],eat:['eats','ate','eaten','eating'],
 drink:['drinks','drank','drunk','drinking'],buy:['buys','bought','buying'],send:['sends','sent','sending'],meet:['meets','met','meeting'],
 child:['children'],person:['people'],man:['men'],woman:['women'],foot:['feet'],tooth:['teeth'],knife:['knives'],wife:['wives'],
 ticket:['tickets'],train:['trains'],shoe:['shoes'],onion:['onions'],photo:['photos'],day:['days'],night:['nights'],room:['rooms'],
 small:['smaller','smallest'],near:['nearer','nearest'],quiet:['quieter','quietest'],slow:['slower','slowest','slowly'],clear:['clearer','clearest','clearly']
};
const contractions:Record<string,string[]>={"i'm":['i','am'],"you're":['you','are'],"he's":['he','is'],"she's":['she','is'],"it's":['it','is'],"we're":['we','are'],"they're":['they','are'],"don't":['do','not'],"doesn't":['does','not'],"can't":['can','not'],cannot:['can','not'],"i've":['i','have'],"we've":['we','have'],"isn't":['is','not'],"aren't":['are','not']};
export function englishTokens(text:string):string[]{return (text.normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").match(/[a-z]+(?:['-][a-z]+)*/g)||[]).flatMap(t=>contractions[t]||[t]);}
export function wordMatches(headword:string,text:string){const head=headword.toLowerCase(),tokens=new Set(englishTokens(text));return tokens.has(head)?'exact':wordForms[head]?.some(f=>tokens.has(f))?'inflection':null;}
export function buildLearningLinks(content:Curriculum){
 const words=content.materials.filter(m=>m.kind==='word'),phrases=content.materials.filter(m=>m.kind==='phrase');
 const wordLinks=phrases.flatMap(p=>words.flatMap(w=>{const relation=wordMatches(w.english,p.english);return relation?[{word_id:w.id,phrase_id:p.id,relation}]:[];}));
 const dialogueLinks=phrases.flatMap(p=>content.dialogues.filter(d=>d.scene_id===p.scene_id).map(d=>({phrase_id:p.id,dialogue_id:d.id,relation:d.turns.some(t=>englishTokens(t.english).join(' ')===englishTokens(p.english).join(' '))?'exact_line':'same_scene'})));
 return {wordLinks,dialogueLinks};
}
