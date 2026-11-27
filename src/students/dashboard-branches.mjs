const branches=['GODOY_CRUZ','LUJAN_DE_CUYO'];
export function dashboardDayFilters(){
 return branches.flatMap(branch=>Array.from({length:6},(_,i)=>({status:'ACTIVE',branch,weekday:String(i+1)})));
}
export function dashboardDaysByBranch(counts){
 return Object.fromEntries(branches.map((branch,i)=>[branch,counts.slice(i*6,(i+1)*6)]));
}
