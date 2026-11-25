// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { emptyDraft, parseDraft, saveDraft, storageKey } from './socialPresenceModel.ts';
const mock = vi.hoisted(() => ({ getSession: vi.fn(), signInWithOAuth: vi.fn(), callback: null as any, googleAvailable: vi.fn(), loadCloud: vi.fn(), saveCloud: vi.fn() }));
vi.mock('../../../packages/auth/index.ts', () => ({ supabase: { auth: {
 getSession: mock.getSession, signInWithOAuth: mock.signInWithOAuth,
 onAuthStateChange: vi.fn((callback) => { mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; })
} } }));
vi.mock('./googleAuthAvailability.ts', () => ({googleAuthAvailability:mock.googleAvailable}));
vi.mock('./cloudPresenceStore.ts', () => ({loadCloudPresence:mock.loadCloud,saveCloudPresence:mock.saveCloud}));
import YouAppSocialPresence from './YouAppSocialPresence.tsx';
beforeEach(() => { mock.loadCloud.mockResolvedValue(null); mock.saveCloud.mockResolvedValue(1); mock.googleAvailable.mockResolvedValue(true); localStorage.clear(); sessionStorage.clear(); mock.getSession.mockResolvedValue({data:{session:null},error:null}); mock.signInWithOAuth.mockResolvedValue({error:null}); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Presence safety and persistence', () => {
 it('blocks Google sign-in when the provider is disabled', async () => {
  mock.googleAvailable.mockResolvedValue(false);
  mock.signInWithOAuth.mockClear();
  render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
  const button=await screen.findByRole('button',{name:'Google pendiente de habilitación'});
  expect(button.hasAttribute('disabled')).toBe(true);
  fireEvent.click(button);
  expect(mock.signInWithOAuth).not.toHaveBeenCalled();
 });
 it('rejects another user and never trusts connected state from browser storage', () => {
  const draft = emptyDraft('A'); draft.name='Marca A';
  (draft.plans.youtube as any) = {choice:'existing',handle:'canal',status:'CONNECTED',access_token:'secret'};
  expect(parseDraft(JSON.stringify(draft),'B').name).toBe('');
  const safe=parseDraft(JSON.stringify(draft),'A');
  expect(safe.plans.youtube.status).toBe('PENDING_AUTHORIZATION');
  expect(JSON.stringify(safe)).not.toContain('secret');
 });
 it('rejects invalid input and surfaces storage failure', () => {
  const draft=emptyDraft('A');
  expect(()=>saveDraft(localStorage,draft)).toThrow();
  draft.name='Proyecto';draft.handle='invalid user';
  expect(()=>saveDraft(localStorage,draft)).toThrow();
  draft.handle='proyecto.tv';
  expect(()=>saveDraft({setItem:()=>{throw Error('quota');}},draft)).toThrow('quota');
 });
 it('uses the existing Google auth provider with same-origin return and no social permissions', async () => {
  render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Continuar con Google'}));
  expect(mock.signInWithOAuth).toHaveBeenCalledWith({provider:'google',options:{redirectTo:new URL('/redes',window.location.origin).href,queryParams:{prompt:'select_account'}}});
 });
 it('guest drafts persist, restore and cannot turn a manually opened site into a connection', async () => {
  const open=vi.spyOn(window,'open').mockImplementation(()=>null);
  const view=render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('Nombre de la marca'),{target:{value:'Prueba editorial'}});
  fireEvent.change(screen.getByLabelText('Estado de TikTok'),{target:{value:'existing'}});
  fireEvent.click(screen.getByRole('button',{name:'Guardar configuración'}));
  expect(sessionStorage.getItem(storageKey('guest'))).toContain('Prueba editorial');
  fireEvent.click(screen.getByRole('button',{name:'Ver opciones de esta red →'}));
  const openButton=await screen.findByRole('button',{name:'Abrir sitio oficial ↗'});
  expect(openButton.hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox'));
  const link=screen.getByRole('link',{name:'Abrir sitio oficial ↗'});
  expect(link.getAttribute('href')).toBe('https://www.tiktok.com/');
  expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByText(/0 conexiones verificadas/)).toBeTruthy();
  view.unmount();
  render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
  expect((await screen.findByLabelText('Nombre de la marca') as HTMLInputElement).value).toBe('Prueba editorial');
  open.mockRestore();
 });
 it('does not show an authenticated user another user’s local draft', async () => {
  const draft=emptyDraft('A');draft.name='Marca privada A';saveDraft(localStorage,draft);
  mock.getSession.mockResolvedValue({data:{session:{user:{id:'B',is_anonymous:false,user_metadata:{}}}},error:null});
  render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
  expect((await screen.findByLabelText('Nombre de la marca') as HTMLInputElement).value).toBe('');
 });
});

it('keeps editing and network options working while cloud loading never finishes',async()=>{
 mock.loadCloud.mockReturnValue(new Promise(()=>{}));
 mock.getSession.mockResolvedValue({data:{session:{user:{id:'A',is_anonymous:false,user_metadata:{}}}},error:null});
 render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
 const name=await screen.findByLabelText('Nombre de la marca');
 expect(name.closest('fieldset')?.disabled).toBe(false);
 fireEvent.change(name,{target:{value:'Marca durante espera'}});
 fireEvent.change(screen.getByLabelText('Estado de YouTube'),{target:{value:'existing'}});
 fireEvent.click(screen.getByRole('button',{name:'Ver opciones de esta red →'}));
 expect(await screen.findByRole('dialog')).toBeTruthy();
 expect(mock.saveCloud).not.toHaveBeenCalled();
});

it('late cloud response preserves the text the user is currently editing',async()=>{
 let resolve:any;mock.loadCloud.mockReturnValue(new Promise(r=>{resolve=r;}));
 mock.getSession.mockResolvedValue({data:{session:{user:{id:'A',is_anonymous:false,user_metadata:{}}}},error:null});
 render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
 const name=await screen.findByLabelText('Nombre de la marca');
 fireEvent.change(name,{target:{value:'Texto nuevo'}});
 const old=emptyDraft('A');old.name='Texto viejo';
 await act(async()=>{resolve({draft:old,revision:4});});
 expect((name as HTMLInputElement).value).toBe('Texto nuevo');
});

it('cloud save failure is visible and does not block opening network options',async()=>{
 mock.saveCloud.mockRejectedValue(new Error('Conexión no disponible'));
 mock.getSession.mockResolvedValue({data:{session:{user:{id:'A',is_anonymous:false,user_metadata:{}}}},error:null});
 render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);
 fireEvent.change(await screen.findByLabelText('Nombre de la marca'),{target:{value:'Marca local'}});
 await waitFor(()=>expect(screen.getByText(/Espacio privado disponible/)).toBeTruthy());
 fireEvent.click(screen.getByRole('button',{name:'Guardar configuración'}));
 expect(await screen.findByText('Conexión no disponible')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Estado de Facebook'),{target:{value:'existing'}});
 fireEvent.click(screen.getByRole('button',{name:'Ver opciones de esta red →'}));
 expect(await screen.findByRole('dialog')).toBeTruthy();
});

it('times out cloud loading and offers retry while preserving local editing',async()=>{
 vi.useFakeTimers();
 mock.loadCloud.mockReturnValue(new Promise(()=>{}));
 mock.getSession.mockResolvedValue({data:{session:{user:{id:'A',is_anonymous:false,user_metadata:{}}}},error:null});
 await act(async()=>{render(<MemoryRouter><YouAppSocialPresence /></MemoryRouter>);});
 const name=screen.getByLabelText('Nombre de la marca');
 fireEvent.change(name,{target:{value:'Mi borrador conservado'}});
 await act(async()=>{await vi.advanceTimersByTimeAsync(8100);});
 expect(screen.getByRole('button',{name:'Reintentar conexión'})).toBeTruthy();
 expect((name as HTMLInputElement).value).toBe('Mi borrador conservado');
 expect(name.closest('fieldset')?.disabled).toBe(false);
});
