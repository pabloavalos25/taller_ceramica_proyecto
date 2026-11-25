export function draftIsSynced(form,saved){return typeof saved==='string'&&JSON.stringify(form)===saved;}
