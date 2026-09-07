// AssistQ v8 — unified lead-source integration helpers
// This module is intentionally dependency-free. It is loaded by server.js.
export const ASSISTQ_INTEGRATION_SOURCES = [
  {id:'chatbot',name:'AssistQ Chatbot',kind:'built-in'},
  {id:'website_form',name:'Website Contact Form',kind:'webhook'},
  {id:'landing_page',name:'Landing Page',kind:'webhook'},
  {id:'whatsapp',name:'WhatsApp',kind:'webhook'},
  {id:'meta_leads',name:'Meta / Facebook / Instagram Lead Ads',kind:'webhook'},
  {id:'google_leads',name:'Google Ads Lead Forms',kind:'webhook'},
  {id:'portal',name:'Property Portals / Other Lead Source',kind:'webhook'},
  {id:'manual',name:'Offline / Manual Lead',kind:'manual'},
  {id:'csv',name:'CSV Import',kind:'import'},
  {id:'custom',name:'Custom Webhook',kind:'webhook'}
];
export function defaultIntegrationState(){return {website_form:false,landing_page:false,whatsapp:false,meta_leads:false,google_leads:false,portal:false,custom:false};}
export function normaliseExternalLead(raw={},source='Other'){
  const pick=(...keys)=>{for(const k of keys){const v=raw?.[k];if(v!==undefined&&v!==null&&String(v).trim())return String(v).trim();}return ''};
  const nested=raw.lead||raw.data||raw.entry||raw.fields||raw;
  const sourceName=pick('source','lead_source','utm_source')||source;
  return {name:pick('name','full_name','fullName','contact_name','customer_name','first_name'),phone:pick('phone','mobile','mobile_number','phone_number','contact_number','contactNumber'),email:pick('email','email_id','emailId'),location:pick('location','locality','city','area','preferred_location'),budget:pick('budget','budget_range','price'),requirement:pick('requirement','message','query','comments','project_name','property_name','interested_project'),notes:pick('notes','message','query','remarks','comments'),utm_source:sourceName,utm_medium:pick('medium','utm_medium')||'lead_source',utm_campaign:pick('campaign','utm_campaign','campaign_name'),fields:nested.fields&&typeof nested.fields==='object'?nested.fields:{}};
}
