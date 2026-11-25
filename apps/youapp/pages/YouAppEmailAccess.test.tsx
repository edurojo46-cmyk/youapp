// @vitest-environment jsdom
import React from 'react';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
const auth=vi.hoisted(()=>({signInWithPassword:vi.fn(),signUp:vi.fn()}));
vi.mock('../../../src/lib/supabase',()=>({supabase:{auth}}));
vi.mock('../../../src/store/useStore',()=>({useStore:()=>({user:null})}));
import Login from '../../../src/pages/Login.tsx';
beforeEach(()=>{vi.clearAllMocks();auth.signInWithPassword.mockResolvedValue({data:{user:{id:'test-user'}},error:null});});
afterEach(cleanup);
function show(social=true){render(<MemoryRouter initialEntries={['/redes/acceso']}><Routes><Route path="/redes/acceso" element={<Login social={social}/>} /><Route path="/redes" element={<h1>Asistente de redes</h1>} /><Route path="/perfil" element={<h1>Perfil anterior</h1>} /></Routes></MemoryRouter>);}
function fill(){fireEvent.change(screen.getByPlaceholderText('Correo electrónico'),{target:{value:'test@example.invalid'}});fireEvent.change(screen.getByPlaceholderText('Contraseña'),{target:{value:'test-only-password'}});}
it('email sign-in returns a YOUAPP user to the social assistant',async()=>{
 show();fill();fireEvent.click(screen.getByRole('button',{name:'Iniciar Sesión'}));
 expect(await screen.findByRole('heading',{name:'Asistente de redes'})).toBeTruthy();
 expect(auth.signInWithPassword).toHaveBeenCalledWith({email:'test@example.invalid',password:'test-only-password'});
});
it('legacy login retains its original destination',async()=>{
 show(false);fireEvent.change(screen.getByPlaceholderText('Correo electrónico profesional'),{target:{value:'test@example.invalid'}});
 fireEvent.change(screen.getByPlaceholderText('Contraseña'),{target:{value:'test-only-password'}});
 fireEvent.click(screen.getByRole('button',{name:'Iniciar Sesión'}));
 expect(await screen.findByRole('heading',{name:'Perfil anterior'})).toBeTruthy();
});
it('registration rejects mismatched passwords without creating a user',()=>{
 show();fireEvent.click(screen.getByRole('button',{name:'Crear cuenta gratis'}));fill();
 fireEvent.change(screen.getByPlaceholderText('Confirmar contraseña'),{target:{value:'different-password'}});
 fireEvent.click(screen.getByRole('button',{name:'Registrarme'}));
 expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy();
 expect(auth.signUp).not.toHaveBeenCalled();
});

it('registration uses Supabase and explains email confirmation when no session is returned',async()=>{
 auth.signUp.mockResolvedValue({data:{session:null,user:{id:'test-user'}},error:null});
 show();fireEvent.click(screen.getByRole('button',{name:'Crear cuenta gratis'}));fill();
 fireEvent.change(screen.getByPlaceholderText('Nombre completo'),{target:{value:'Usuario de prueba'}});
 fireEvent.change(screen.getByPlaceholderText('Confirmar contraseña'),{target:{value:'test-only-password'}});
 fireEvent.click(screen.getByRole('button',{name:'Registrarme'}));
 expect(await screen.findByText('Si hace falta confirmar tu correo, revisá tu bandeja antes de iniciar sesión.')).toBeTruthy();
 expect(auth.signUp).toHaveBeenCalledWith({email:'test@example.invalid',password:'test-only-password',options:{data:{full_name:'Usuario de prueba'}}});
});
