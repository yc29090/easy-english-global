// Presentation only. Never changes saved states, review scheduling or queue membership.
export const LEARNING_STATES=Object.freeze(['learned','mastered','unmastered','review']);
const labels={zh:{learned:'已学习',mastered:'已掌握',unmastered:'待掌握',review:'待复习'},en:{learned:'Learned',mastered:'Mastered',unmastered:'Not mastered',review:'To review'}};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const statusLabel=(state,language='zh')=>(labels[language==='zh'?'zh':'en'][state]||(language==='zh'?'未标记':'Unmarked'));
export function statusBadge(state,language='zh',label){return `<span class="learning-state-badge" ${LEARNING_STATES.includes(state)?`data-learning-state="${state}"`:''}>${escape(label||statusLabel(state,language))}</span>`;}
export function isReviewDue(record,now=Date.now()){const time=Date.parse(record?.next_review_at);return Number.isFinite(time)&&time<=now;}
function summary(record,language,emptyLabel){return record?.status?`${language==='zh'?'当前：':'Current: '}${statusBadge(record.status,language)}${isReviewDue(record)?' '+statusBadge('review',language,language==='zh'?'已到复习时间':'Review time reached'):''}`:escape(emptyLabel||(language==='zh'?'未标记':'Unmarked'));}
function nextReview(record,language){return record?.next_review_at?`${language==='zh'?'下次复习：':'Next review: '}${escape(new Date(record.next_review_at).toLocaleString(language==='zh'?'zh-CN':'en'))}`:'';}
export function statusPanel(record,{language='zh',buttonAttributes=()=>'',panelAttributes='',summaryAttributes='',groupLabel,emptyLabel}={}){
 const current=record?.status||'';
 return `<div class="learning-state-panel" ${panelAttributes}><div class="learning-status-group statuses" role="group" aria-label="${escape(groupLabel||(language==='zh'?'学习状态自评':'Learning self-assessment'))}" aria-busy="false" data-confirmed-state="${escape(current)}">${LEARNING_STATES.map(value=>`<button type="button" class="learning-status-button" data-learning-status="${value}" ${buttonAttributes(value)} aria-pressed="${current===value}" aria-disabled="false"><span class="state-check" aria-hidden="true">✓</span><span>${statusLabel(value,language)}</span></button>`).join('')}</div><p class="learning-state-summary" data-status-summary ${summaryAttributes}>${summary(record,language,emptyLabel)}</p><p class="help" data-next-review>${nextReview(record,language)}</p><p class="learning-state-feedback" data-status-feedback role="status" aria-live="polite" aria-atomic="true"></p></div>`;
}
export function paintStatus(panel,state,{pending=false,language='zh'}={}){
 const group=panel.querySelector('.learning-status-group');if(!group)return;
 group.setAttribute('aria-busy',String(pending));
 if(!pending)group.dataset.confirmedState=state||'';
 panel.toggleAttribute('data-save-pending',pending);
 for(const button of group.querySelectorAll('[data-learning-status]'))button.setAttribute('aria-pressed',String(button.dataset.learningStatus===state));
 const feedback=panel.querySelector('[data-status-feedback]');if(feedback)feedback.textContent=pending?(language==='zh'?'正在保存：':'Saving: ')+statusLabel(state,language)+(language==='zh'?'，尚未确认。':'; not yet confirmed.') : '';
}
export function refreshStatusPanel(panel,record,{language='zh',emptyLabel}={}){
 paintStatus(panel,record?.status,{language});
 panel.querySelector('[data-status-summary]').innerHTML=summary(record,language,emptyLabel);
 panel.querySelector('[data-next-review]').textContent=nextReview(record,language);
}
export function statusBusy(root,busy){for(const button of root.querySelectorAll('.learning-status-button'))button.setAttribute('aria-disabled',String(busy));}
