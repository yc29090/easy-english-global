import type {Curriculum} from './content.ts';
/** Finite, authored examples. No user substitution or runtime sentence concatenation. */
const templates=[
 {id:'greeting',en:'Good ….',zh:'问候',examples:[['morning','Good morning.','早上好。'],['afternoon','Good afternoon.','下午好。'],['evening','Good evening.','晚上好。'],['night','Good night.','晚安。']]},
 {id:'would-like',en:'I would like some ….',zh:'表达想要',examples:[['water','I would like some water.','我想喝点水。'],['tea','I would like some tea.','我想喝点茶。'],['coffee','I would like some coffee.','我想喝点咖啡。'],['milk','I would like some milk.','我想喝点牛奶。'],['juice','I would like some juice.','我想喝点果汁。'],['rice','I would like some rice.','我想要点米饭。']]},
 {id:'where-is',en:'Where is the …?',zh:'询问地点',examples:[['bathroom','Where is the bathroom?','卫生间在哪里？'],['station','Where is the station?','车站在哪里？'],['hotel','Where is the hotel?','酒店在哪里？'],['airport','Where is the airport?','机场在哪里？'],['bank','Where is the bank?','银行在哪里？'],['pharmacy','Where is the pharmacy?','药店在哪里？']]},
 {id:'send-me',en:'Could you send me …?',zh:'请求发送',examples:[['message','Could you send me a message?','你能给我发条消息吗？'],['invoice','Could you send me the invoice?','你能把发票发给我吗？'],['list','Could you send me a price list?','你能发给我一份价目表吗？'],['file','Could you send me the file?','你能把文件发给我吗？']]}
];
export function buildPatternVariants(content:Curriculum){return templates.flatMap((t)=>t.examples.map(([word,english,chinese],index)=>{
 const material=content.materials.find(m=>m.kind==='word'&&m.english.toLowerCase()===word);if(!material)throw new Error('Pattern vocabulary is missing');
 return {id:`ee-v2-${t.id}-${word}`,template_id:t.id,template_en:t.en,template_zh:t.zh,word_id:material.id,english,chinese,is_free:material.is_free,sort_order:index};
}));}
