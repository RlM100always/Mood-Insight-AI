export const CONTEXT_TAGS = ['Work','Study','Family','Relationships','Health','Finances','Rest','Social','Other'] as const;
export const MAX_CONTEXT_TAGS=8;
export const MAX_CONTEXT_TAG_LENGTH=24;

export function normalizeContextTag(raw:string):string{
  return raw.trim().replace(/\s+/g,' ');
}
export function isValidContextTag(raw:string):boolean{
  const tag=normalizeContextTag(raw);
  return tag.length>=1&&tag.length<=MAX_CONTEXT_TAG_LENGTH&&!/[\u0000-\u001f,\u007f]/.test(tag);
}
export function normalizeContextTags(tags:string[]):string[]{
  const result:string[]=[];
  const seen=new Set<string>();
  for(const raw of tags){
    const tag=normalizeContextTag(raw);
    if(!isValidContextTag(tag))throw new Error('Context labels must be 1–24 characters and cannot contain commas or control characters.');
    const key=tag.toLocaleLowerCase();
    if(seen.has(key))continue;
    seen.add(key);result.push(tag);
    if(result.length>MAX_CONTEXT_TAGS)throw new Error('Use up to 8 context labels on one day.');
  }
  return result;
}
export function isValidContextCsv(value:string):boolean{
  if(typeof value!=='string'||value.length>250)return false;
  if(value==='')return true;
  try{
    const raw=value.split(',');
    const normalized=normalizeContextTags(raw);
    return normalized.length===raw.length&&normalized.join(',')===value;
  }catch{return false;}
}
