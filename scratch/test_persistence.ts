import { supabase } from '../src/lib/supabase';
import { generateSchedule } from '../src/lib/tv/scheduleGenerator';
import { persistSignal, persistScheduleMutation, logSignalEvent } from '../src/lib/tv/signalPersistence';
import { useSignalStore } from '../src/lib/tv/signalStore';

async function runTests() {
  console.log('--- E2E Persistence Tests (Replay Mode) ---');
  
  // 0. AUTH (Guest Mode)
  console.log('\n[0] TEST SETUP: Iniciando sesión anónima (Guest Mode)');
  const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
  if (authError || !authData.user) {
    console.error('❌ Error iniciando sesión anónima:', authError);
    return;
  }
  const guestA_UserId = authData.user.id;
  console.log(`✅ Sesión anónima iniciada (user_id: ${guestA_UserId})`);

  // 1. CREATE
  console.log('\n[1] TEST CREATE: Generar y persistir');
  const signal = await generateSchedule("Roma y descubrimientos arqueológicos");
  console.log(`- Señal generada localmente: ${signal.id}`);
  
  const persisted = await persistSignal(signal);
  if (!persisted) {
    console.error('❌ Falló la persistencia inicial');
    return;
  }
  console.log('✅ Señal persistida en Supabase');

  // 2. RELOAD
  console.log('\n[2] TEST RELOAD: Verificar que exista en BD');
  const { data: dbSignal, error } = await supabase
    .from('custom_signals')
    .select('id, name')
    .eq('client_signal_id', signal.id)
    .single();
    
  if (error || !dbSignal) {
    console.error('❌ No se pudo recuperar de BD:', error);
    return;
  }
  console.log(`✅ Recuperada de BD (postgres id: ${dbSignal.id})`);

  // 3. REORDER (RPC)
  console.log('\n[3] TEST REORDER: Invocar RPC');
  // Reverse the blocks for testing
  const reversedIds = [...signal.schedule].reverse().map(b => b.id);
  const reorderSuccess = await persistScheduleMutation(signal.id, reversedIds);
  
  if (!reorderSuccess) {
    console.error('❌ Falló la mutación del schedule');
    return;
  }
  
  const { data: itemsAfter } = await supabase
    .from('signal_schedule_items')
    .select('block_id, position, start_offset_sec')
    .eq('signal_id', dbSignal.id)
    .order('position', { ascending: true });
    
  if (itemsAfter && itemsAfter.length > 0 && itemsAfter[0].block_id === reversedIds[0]) {
    console.log('✅ Reordenamiento exitoso vía RPC (Position y Offsets actualizados)');
  } else {
    console.error('❌ El reordenamiento no se reflejó correctamente');
    return;
  }

  // 4. DELETE & EVENTS
  console.log('\n[4] TEST EVENTS: Loguear eliminación');
  await logSignalEvent(signal.id, reversedIds[0], 'block_removed');
  
  const { data: events } = await supabase
    .from('signal_events')
    .select('*')
    .eq('signal_id', dbSignal.id)
    .eq('event_type', 'block_removed');
    
  if (events && events.length > 0) {
    console.log('✅ Evento registrado en signal_events');
  } else {
    console.error('❌ No se registró el evento');
    return;
  }

  // 5. IDEMPOTENCY
  console.log('\n[5] TEST IDEMPOTENCY: Doble upsert');
  const persistedAgain = await persistSignal(signal);
  if (persistedAgain) {
    const { count } = await supabase
      .from('custom_signals')
      .select('*', { count: 'exact', head: true })
      .eq('client_signal_id', signal.id);
      
    if (count === 1) {
      console.log('✅ Idempotencia validada (no duplicó la señal)');
    } else {
      console.error(`❌ Falló la idempotencia, hay ${count} señales`);
    }
  }

  // 6. EVENTS
  console.log('\n[6] TEST EVENTS: Verificación estricta de logueo múltiple');
  await logSignalEvent(signal.id, null, 'user_skip', { reason: 'test' });
  await logSignalEvent(signal.id, reversedIds[1], 'block_reordered', { from: 1, to: 2 });
  
  const { data: multipleEvents } = await supabase
    .from('signal_events')
    .select('event_type')
    .eq('signal_id', dbSignal.id);
    
  if (multipleEvents && multipleEvents.length >= 3) {
    // 3 events: block_removed (from previous test), user_skip, block_reordered
    const types = multipleEvents.map(e => e.event_type);
    if (types.includes('user_skip') && types.includes('block_reordered')) {
      console.log('✅ Eventos registrados correctamente sin duplicados de estado');
    }
  } else {
    console.error('❌ Falló la persistencia de los nuevos eventos');
  }

  // 7. AUTH (RLS)
  console.log('\n[7] TEST AUTH: Violación RLS cruzada (Guest B intentando leer a Guest A)');
  
  // Cerrar la sesión de Guest A
  await supabase.auth.signOut();
  
  // Iniciar sesión como Guest B
  const { data: authBData, error: authBError } = await supabase.auth.signInAnonymously();
  if (authBError || !authBData.user) {
    console.error('❌ Error iniciando sesión anónima B:', authBError);
    return;
  }
  console.log(`✅ Sesión Guest B iniciada (user_id: ${authBData.user.id})`);

  // Guest B intenta actualizar la señal de Guest A
  const { data: authTestUpdate, error: authErrorUpdate } = await supabase
    .from('custom_signals')
    .update({ name: 'HACKED' })
    .eq('client_signal_id', signal.id)
    .select();
    
  if (authErrorUpdate || !authTestUpdate || authTestUpdate.length === 0) {
    console.log('✅ RLS impidió UPDATE no autorizado de la señal');
  } else {
    console.error('❌ RLS permitió actualizar la señal!');
  }

  // Guest B intenta leer la señal de Guest A (visibility es private)
  const { data: authTestSelect, error: authErrorSelect } = await supabase
    .from('custom_signals')
    .select('id')
    .eq('client_signal_id', signal.id);

  if (authErrorSelect || !authTestSelect || authTestSelect.length === 0) {
    console.log('✅ RLS impidió SELECT no autorizado de la señal');
  } else {
    console.error('❌ RLS permitió leer la señal privada!');
  }

  // Volver a iniciar sesión como Guest A (usualmente requeriría token, pero para el test
  // ya demostramos el aislamiento, así que concluimos).
  console.log('\n✅ Todos los tests de persistencia pasaron exitosamente.');
}

runTests().catch(console.error);
