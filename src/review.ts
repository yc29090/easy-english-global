export type LearningStatus='learned'|'unmastered'|'mastered'|'review';
/** Transparent, status-based intervals, with no daily quotas or required streaks. */
export function reviewSchedule(status:LearningStatus,previousStreak=0,now=Date.now()){
 const masteryStreak=status==='mastered'?Math.min(previousStreak+1,5):0;
 const minutes=status==='unmastered'?10:status==='review'?60:status==='learned'?1440:Math.min(3*2**(masteryStreak-1),30)*1440;
 return {masteryStreak,nextReviewAt:new Date(now+minutes*60000).toISOString()};
}
