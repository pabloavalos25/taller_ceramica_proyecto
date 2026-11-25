export function createTierGenerationGate({loadSession,run}){
  let pending;
  return async function ensure(token,role){
    const session=await loadSession(token);
    if(!session||session.role!==role||session.mustChangePassword)return;
    if(!pending)pending=run().finally(()=>{pending=null;});
    await pending;
  };
}
