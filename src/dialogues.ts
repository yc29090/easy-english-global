export type Dialogue={id:string;title_zh:string;title_en:string;category:'life'|'business';roles:{a:{zh:string;en:string};b:{zh:string;en:string}};turns:{role:'a'|'b';english:string;chinese:string}[]};
// Legacy supplementary scripts: stable IDs and turn order preserve existing practice progress.
// Free to all learners; separate from the 100 database-backed curriculum dialogues.
export const dialogues:Dialogue[]=[
 {id:'practice-greeting-v1',title_zh:'第一次见面',title_en:'Meeting someone',category:'life',roles:{a:{zh:'你',en:'You'},b:{zh:'新朋友',en:'New friend'}},turns:[
  {role:'b',english:'Hello!',chinese:'你好！'},
  {role:'a',english:'Hello!',chinese:'你好！'},
  {role:'b',english:'My name is Sam.',chinese:'我叫萨姆。'},
  {role:'a',english:'My name is Alex.',chinese:'我叫亚历克斯。'},
  {role:'b',english:'Nice to meet you.',chinese:'很高兴认识你。'},
  {role:'a',english:'Nice to meet you, too.',chinese:'我也很高兴认识你。'}]},
 {id:'practice-water-v1',title_zh:'买一瓶水',title_en:'Buying water',category:'life',roles:{a:{zh:'顾客',en:'Customer'},b:{zh:'店员',en:'Shop assistant'}},turns:[
  {role:'b',english:'Hello. Can I help you?',chinese:'你好，需要帮忙吗？'},
  {role:'a',english:'Water, please.',chinese:'请给我水。'},
  {role:'b',english:'One bottle?',chinese:'一瓶吗？'},
  {role:'a',english:'Yes, please.',chinese:'是的，谢谢。'},
  {role:'b',english:'Here you are.',chinese:'给你。'},
  {role:'a',english:'Thank you.',chinese:'谢谢。'}]},
 {id:'practice-work-v1',title_zh:'工作中请人帮忙',title_en:'Asking for help at work',category:'business',roles:{a:{zh:'求助者',en:'Asking for help'},b:{zh:'同事',en:'Colleague'}},turns:[
  {role:'a',english:'Excuse me.',chinese:'打扰一下。'},
  {role:'b',english:'Yes?',chinese:'什么事？'},
  {role:'a',english:'Can you help me?',chinese:'你能帮我吗？'},
  {role:'b',english:'Of course.',chinese:'当然。'},
  {role:'a',english:'Thank you.',chinese:'谢谢你。'},
  {role:'b',english:'You are welcome.',chinese:'不客气。'}]}
];
