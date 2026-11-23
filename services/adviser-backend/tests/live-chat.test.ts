import test from 'node:test';
import assert from 'node:assert/strict';
import { LiveChat } from '../src/ai/live-chat.ts';
import type { ProductVariant } from '../src/contracts/catalog.ts';
const variants: ProductVariant[] = [{variantId:'v1',familyId:'f1',modelName:'Known laptop',category:'pc_laptop',brand:'Test',specifications:{ramGb:16,storageGb:512,cpu:'Unknown',os:'Unknown'},factIds:[]}];
const input = {text:'Help me choose',history:[],profileRevision:2};
const output = (data: unknown) => new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(data)}]}]}));
test('chat renders only catalog facts and preserves confirmation revision',async()=>{
  const draft={category:'pc_laptop',purposes:['laptop_office_study','laptop_software_dev','laptop_ultraportable'],priorities:['priority_budget_savings','priority_performance_cpu','priority_battery_life'],budget:'30000000',minRam:'16',os:''};
  const ai=new LiveChat({key:'secret',model:'test',request:async(_url,init)=>{
    const body=JSON.parse(init!.body as string);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);
    return output({variantIds:['v1'],nextQuestion:'confirm',proposal:draft});
  }});
  const reply=await ai.reply(input,variants,new AbortController().signal);
  assert.equal(reply.mode,'provider');assert.equal(reply.proposal?.baseProfileRevision,2);assert.match(reply.text,/Known laptop/);assert.ok(!JSON.stringify(reply).includes('secret'));
});
test('chat rejects invented products and invalid needs without a proposal',async()=>{
  for(const data of [{variantIds:['invented'],nextQuestion:'budget',proposal:null},{variantIds:['v1'],nextQuestion:'confirm',proposal:{category:'pc_laptop',purposes:[],priorities:[],budget:'-1',minRam:'',os:''}}]){
    const ai=new LiveChat({key:'test',model:'test',request:async()=>output(data)});
    const reply=await ai.reply(input,variants,new AbortController().signal);
    assert.equal(reply.mode,'fallback');assert.equal(reply.proposal,undefined);
  }
});
test('chat without a key never calls provider and labels fallback',async()=>{
  const ai=new LiveChat({model:'test',request:async()=>{throw Error('Unexpected call');}});
  const reply=await ai.reply(input,variants,new AbortController().signal);
  assert.equal(reply.mode,'fallback');assert.equal(reply.proposal,undefined);
});
