export function summarizeMaterialHistory(students){
  const items=students.flatMap(student=>student.items);let total=0n,paid=0n,inconsistent=false;
  for(const item of items){const amount=BigInt(item.amountCents),received=BigInt(item.paidCents);total+=amount;paid+=received;if(received>amount)inconsistent=true;}
  return {records:items.length,totalCents:total.toString(),paidCents:paid.toString(),inconsistent};
}
