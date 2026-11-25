import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({getUser:vi.fn(),from:vi.fn()}));
vi.mock('../../../packages/auth/index.ts',()=>({supabase:{auth:{getUser:mocks.getUser},from:mocks.from}}));
import { loadCloudPresence, saveCloudPresence } from './cloudPresenceStore.ts';
import { emptyDraft } from './socialPresenceModel.ts';
beforeEach(()=>{vi.clearAllMocks();});
describe('private cloud workspace boundary',()=>{
 it('rejects a different owner before accessing the database',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'B',is_anonymous:false}},error:null});
  await expect(loadCloudPresence('A')).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('rejects anonymous sessions even when IDs match',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'A',is_anonymous:true}},error:null});
  await expect(saveCloudPresence(emptyDraft('A'),null)).rejects.toThrow();
  expect(mocks.from).not.toHaveBeenCalled();
 });
 it('does not accept a cloud row for another owner',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'A',is_anonymous:false}},error:null});
  const query:any={select:vi.fn(()=>query),eq:vi.fn(()=>query),maybeSingle:vi.fn().mockResolvedValue({data:{owner_id:'B',draft:emptyDraft('B'),revision:1},error:null})};
  mocks.from.mockReturnValue(query);
  await expect(loadCloudPresence('A')).rejects.toThrow();
  expect(query.eq).toHaveBeenCalledWith('owner_id','A');
 });
 it('updates only the expected owner and revision, strips forged evidence and secrets',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'A',is_anonymous:false}},error:null});
  const query:any={update:vi.fn(()=>query),eq:vi.fn(()=>query),select:vi.fn(()=>query),maybeSingle:vi.fn().mockResolvedValue({data:{owner_id:'A',revision:3},error:null})};
  mocks.from.mockReturnValue(query);
  const draft:any=emptyDraft('A');draft.name='Marca';draft.access_token='do-not-store';draft.plans.youtube.status='CONNECTED';
  expect(await saveCloudPresence(draft,2)).toBe(3);
  expect(query.eq).toHaveBeenCalledWith('owner_id','A');
  expect(query.eq).toHaveBeenCalledWith('revision',2);
  expect(JSON.stringify(query.update.mock.calls)).not.toContain('do-not-store');
  expect(JSON.stringify(query.update.mock.calls)).not.toContain('CONNECTED');
 });
 it('reports concurrent edits instead of overwriting another device',async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:'A',is_anonymous:false}},error:null});
  const query:any={update:vi.fn(()=>query),eq:vi.fn(()=>query),select:vi.fn(()=>query),maybeSingle:vi.fn().mockResolvedValue({data:null,error:null})};
  mocks.from.mockReturnValue(query);
  await expect(saveCloudPresence(emptyDraft('A'),1)).rejects.toThrow('otra sesión');
 });
});
