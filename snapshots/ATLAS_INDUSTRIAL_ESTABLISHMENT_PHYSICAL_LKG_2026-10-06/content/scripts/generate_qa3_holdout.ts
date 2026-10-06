import fs from 'fs';

const cases = [];
const labels = {};

function addCase(id, channel, title, desc, goldLabel, goldEntity) {
    cases.push({
        id: id,
        channel: channel,
        title: title,
        desc: desc
    });
    labels[id] = { label: goldLabel, entity: goldEntity };
}

// 1. SELF REPORT - Expansion
addCase('h1', 'Mercado Libre', 'Inauguramos nuestro nuevo centro logístico en Monterrey', 'Seguimos creciendo para llegar más rápido a tus manos.', 'TRUE_POSITIVE', 'Mercado Libre');
addCase('h2', 'Globant', 'New office opening in London', 'We are thrilled to announce our expansion into the UK market with a brand new state of the art office.', 'TRUE_POSITIVE', 'Globant');
addCase('h3', 'Auth0', 'We are hiring! Join our identity team', 'Looking for engineers in Buenos Aires.', 'TRUE_POSITIVE', 'Auth0');

// 2. THIRD PARTY REPORT / NEWS
addCase('h4', 'CNN en Español', 'Amazon anuncia la apertura de 5 nuevas plantas', 'El gigante del e-commerce invertirá millones.', 'TRUE_POSITIVE', 'Amazon');
addCase('h5', 'Europa Press', 'Repsol construirá una nueva refinería', 'La petrolera española apuesta por los biocombustibles.', 'TRUE_POSITIVE', 'Repsol');
addCase('h6', 'Canal 13 Noticias', 'Cierra importante fábrica en el sur', 'Despiden a 500 empleados.', 'FALSE_POSITIVE', 'Fábrica'); // Contraction, not expansion
addCase('h7', 'TechCrunch', 'Stripe acquires new startup', 'Stripe continues its expansion by acquiring a small payment startup.', 'TRUE_POSITIVE', 'Stripe');

// 3. ADVICE / OPINION
addCase('h8', 'Emprendedor Exitoso', '5 tips para abrir tu propia sucursal', 'Te enseño cómo expandir tu negocio sin morir en el intento.', 'FALSE_POSITIVE', 'N/A');
addCase('h9', 'Finanzas con Juan', '¿Cuánto cuesta abrir una franquicia?', 'Analizamos los costos ocultos de abrir un nuevo local.', 'FALSE_POSITIVE', 'N/A');

// 4. NEGATION
addCase('h10', 'Noticias Financieras', 'Tesla descarta abrir fábrica en México', 'Elon Musk confirmó que no seguirán con el proyecto.', 'FALSE_POSITIVE', 'Tesla');
addCase('h11', 'La Nación', 'El gobierno no construirá la nueva ruta', 'Por falta de presupuesto, la obra pública queda cancelada.', 'FALSE_POSITIVE', 'Gobierno');

// 5. STALE
addCase('h12', 'Tech Review', 'Hace un año que Apple inauguró su HQ', 'Recordamos cómo fue la apertura del Apple Park.', 'FALSE_POSITIVE', 'Apple');

// 6. SPECULATION / GAMING
addCase('h13', 'Gamer Zone', 'Minecraft: Cómo construir tu primera base', 'En este video abrimos una nueva base en el server.', 'FALSE_POSITIVE', 'Minecraft');
addCase('h14', 'Laura opina', 'Mi opinión sobre la nueva tienda de Zara', 'Fui a conocer el local y esto fue lo que pasó.', 'FALSE_POSITIVE', 'Zara'); // Just opinion

// 7. PUBLIC INFRA / OTHER
addCase('h15', 'Municipalidad de Córdoba', 'Inauguramos el nuevo hospital zonal', 'Seguimos sumando obras para la comunidad.', 'TRUE_POSITIVE', 'Municipalidad de Córdoba');

// We have 15 cases. Let's add 10 more to reach 25 hard cases.
addCase('h16', 'Startups Hoy', 'La startup Ualá abre oficinas en Colombia', 'Expansión regional confirmada.', 'TRUE_POSITIVE', 'Ualá');
addCase('h17', 'El Canal del Inversor', 'Por qué deberías abrir una cuenta en Binance', 'Consejos financieros.', 'FALSE_POSITIVE', 'N/A');
addCase('h18', 'Gimnasios Megatlon', '¡Abrimos nueva sede en Palermo!', 'Vení a entrenar con nosotros.', 'TRUE_POSITIVE', 'Gimnasios Megatlon');
addCase('h19', 'Ruzzarin TV', 'El problema de la expansión desmedida', 'Filosofía y crítica.', 'FALSE_POSITIVE', 'N/A');
addCase('h20', 'Toyota Argentina', 'Nuevo turno de producción en la planta de Zárate', 'Contrataremos 300 nuevos operarios.', 'TRUE_POSITIVE', 'Toyota Argentina');
addCase('h21', 'Vision TV', 'Google retrasa la apertura de su centro de datos', 'El proyecto queda en pausa.', 'FALSE_POSITIVE', 'Google');
addCase('h22', 'Noticias 24', 'Se inaugura la nueva autopista', 'El tramo conecta ambas ciudades.', 'TRUE_POSITIVE', 'Gobierno');
addCase('h23', 'Podcast Inmobiliario', 'Lecciones sobre la inversión en oficinas', 'Cómo aprovechar el mercado.', 'FALSE_POSITIVE', 'N/A');
addCase('h24', 'Vogue', 'La nueva colección de invierno', 'Descubrí los mejores looks.', 'FALSE_POSITIVE', 'N/A');
addCase('h25', 'Banco Galicia', 'Sumamos 50 nuevas búsquedas IT', 'Postulate hoy mismo.', 'TRUE_POSITIVE', 'Banco Galicia');

fs.writeFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/holdout_cases.json', JSON.stringify(cases, null, 2));
fs.writeFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/holdout_labels.json', JSON.stringify(labels, null, 2));

console.log(`Generated ${cases.length} cases.`);
