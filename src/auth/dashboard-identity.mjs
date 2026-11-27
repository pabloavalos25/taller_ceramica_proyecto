export function dashboardPresentation({displayName,accessLevel}={}) {
  const name=typeof displayName==='string'?displayName.trim():'';
  return {welcome:name?`Te damos la bienvenida, ${name}`:'Te damos la bienvenida',showIncomeChart:accessLevel==='PRINCIPAL'};
}
