import {member} from './security.ts';
/** User-confirmed: existing paid membership covers both versions with no additional charge. */
export function ogdenEntitlement(user:{membership:string;trial_until?:string},now=Date.now(),productionEnabled=false){
 return {coversBothVersions:member(user,now),additionalChargeCny:0,policy:'existing-members-both-versions',nonMemberScope:'not-yet-set',productionEnabled};
}
