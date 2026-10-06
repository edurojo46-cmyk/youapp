/**
 * scripts/generate_final_benchmark_query_set.mjs
 * 
 * Generates the authoritative FINAL_BENCHMARK_QUERY_SET independently from holdout answers
 * and freezes it as an immutable artifact per Section 5.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Top 300 Argentine Surnames
const SURNAMES = [
  'GONZALEZ', 'RODRIGUEZ', 'GARCIA', 'FERNANDEZ', 'LOPEZ', 'MARTINEZ', 'PEREZ', 'GOMEZ',
  'SANCHEZ', 'DIAZ', 'ALVAREZ', 'ROMERO', 'SOSA', 'TORRES', 'RUIZ', 'RAMIREZ', 'FLORES',
  'ACOSTA', 'BENITEZ', 'MEDINA', 'HERRERA', 'AGUIRRE', 'PERALTA', 'GUTIERREZ', 'CASTRO',
  'DOMINGUEZ', 'MOLINA', 'ORTIZ', 'SILVA', 'NUÑEZ', 'LUNA', 'JUAREZ', 'CABRERA', 'RIOS',
  'MORALES', 'GODOY', 'MORENO', 'FERREYRA', 'CARRIZO', 'VEGA', 'CASTILLO', 'OJEDA',
  'ROJAS', 'CAMPOS', 'CORIA', 'PAZ', 'CARDOSO', 'MENDOZA', 'VERA', 'LUCERO', 'CRUZ',
  'CORDOBA', 'LEGUIZAMON', 'IBARRA', 'ROSSI', 'BIANCHI', 'FERRARI', 'ESPINOZA', 'CHAVEZ',
  'VILLALBA', 'GIMENEZ', 'CORONA', 'NAVARRO', 'PONCE', 'BARRIOS', 'FALCON', 'MALDONADO',
  'MIRANDA', 'BUSTOS', 'QUIROGA', 'DUARTE', 'LEIVA', 'VELAZQUEZ', 'PAREDES', 'AVILA',
  'CACERES', 'ROLDAN', 'ARIAS', 'VAZQUEZ', 'CABRAL', 'LENCINA', 'AYALA', 'BOGADO',
  'BAEZ', 'VERGARA', 'ACUÑA', 'VALDEZ', 'ALONSO', 'BLANCO', 'CALVO', 'DELGADO',
  'FIGUEROA', 'GALLARDO', 'HEREDIA', 'IGLESIAS', 'JAIME', 'LARA', 'MARIN', 'NIETO',
  'OVIEDO', 'PRIETO', 'QUINTEROS', 'RIVAS', 'SALINAS', 'TOLEDO', 'URQUIZA', 'VALLEJOS',
  'ZAPATA', 'ARCE', 'BRAVO', 'CORVALAN', 'DAVILA', 'ESCALANTE', 'FRANCO', 'HURTADO',
  'INFANTE', 'JARA', 'KAUFMAN', 'LEDESMA', 'MANSILLA', 'ORTEGA', 'PALACIOS', 'QUINTANA',
  'REYNOSO', 'SUAREZ', 'TEJEDA', 'URIBE', 'VALLE', 'ZURITA', 'BARRERA', 'CANTERO',
  'MEDRANO', 'VILLANUEVA', 'LUDUEÑA', 'BARRETO', 'CORREA', 'GALEANO', 'CARRANZA',
  'PEREYRA', 'MONTIEL', 'ZABALA', 'VILLAGRA', 'BELTRAN', 'CORNEJO', 'MONTENEGRO',
  'BARRIONUEVO', 'SANDOVAL', 'OLIVERA', 'CEJAS', 'FARIAS', 'ESPINOSA', 'ARANDA',
  'ALMIRON', 'SOTELO', 'COLMAN', 'SOLIS', 'MAIDANA', 'VILLAR', 'RIVERO', 'ZARATE',
  'VILLEGAS', 'ESCOBAR', 'SEGOVIA', 'FERREIRA', 'LEZCANO', 'CARDOZO', 'ARAGON',
  'CARBAJAL', 'AGUILAR', 'MERCADO', 'PAEZ', 'SALVATIERRA', 'LOBOS', 'BAZAN', 'ROMAN',
  'PASTOR', 'CARDENAS', 'SORIA', 'BARROSO', 'VIDAL', 'SERRANO', 'CANO', 'PEÑA',
  'CONTRERAS', 'VALENZUELA', 'GUZMAN', 'RICO', 'BANEGAS', 'LUJAN', 'CASAS', 'ALFARO',
  'MUNOZ', 'HERRERO', 'SANTILLAN', 'VARGAS', 'CORONEL', 'MACIEL', 'VERON', 'CUELLO',
  'ALBORNOZ', 'ARDILES', 'TABORDA', 'SANTOS', 'GUERRERO', 'VILLARREAL', 'LUCCHESI',
  'FARIÑA', 'SALGUERO', 'LIZARRAGA', 'OLMOS', 'SAAVEDRA', 'ZAMORA', 'CORBALAN',
  'BRITEZ', 'LOVATO', 'BARRIENTOS', 'VALLEJO', 'LOBATO', 'PALAVECINO', 'BARROS',
  'CHACON', 'BUSTAMANTE', 'CAMACHO', 'SALAZAR', 'MENDEZ', 'ANDRADA', 'NIEVA',
  'MORAN', 'CORDOVA', 'FIGUEROA', 'VALENCIA', 'MOLINA', 'LATORRE', 'BASUALDO',
  'CARRASCO', 'BARRIONUEVO', 'ZURITA', 'GODOY', 'BAEZ', 'SEGOVIA', 'CARRIZO'
];

const FIRST_NAMES = [
  'JUAN', 'CARLOS', 'MARIA', 'JOSE', 'ANA', 'JORGE', 'LUIS', 'ROBERTO', 'MIGUEL',
  'MARCELO', 'DIEGO', 'ALEJANDRO', 'GUSTAVO', 'PABLO', 'FERNANDO', 'DANIEL', 'MARTIN',
  'GABRIEL', 'RICARDO', 'EDUARDO', 'HECTOR', 'SERGIO', 'HORACIO', 'OSCAR', 'RUBEN',
  'PATRICIA', 'LAURA', 'SILVIA', 'ANDREA', 'CLAUDIA', 'MONICA', 'SUSANA', 'BEATRIZ',
  'LILIANA', 'GRACIELA', 'MARTA', 'NATALIA', 'VERONICA', 'PAULA', 'VALERIA', 'CAROLINA',
  'LUCIA', 'CECILIA', 'ELENA', 'FLORENCIA', 'MARIANA', 'GABRIELA', 'SOFIA', 'CAMILA',
  'CRISTIAN', 'LUCAS', 'MATIAS', 'NICOLAS', 'GONZALO', 'JOAQUIN', 'AGUSTIN', 'FEDERICO',
  'FRANCO', 'LEONARDO', 'EMILIANO', 'SEBASTIAN', 'MAXIMILIANO', 'EZEQUIEL', 'RODRIGO',
  'JULIAN', 'TOMAS', 'FACUNDO', 'MANUEL', 'IGNACIO', 'SANTIAGO', 'MARCOS', 'DAMIAN',
  'MARIO', 'RAMON', 'RAUL', 'HUGO', 'WALTER', 'CESAR', 'NORBERTO', 'ARIEL',
  'GUILLERMO', 'ADRIAN', 'ESTEBAN', 'MAURICIO', 'LIONEL', 'ANGEL', 'LEANDRO', 'FEDERICO',
  'LUCAS', 'TOMAS', 'BRUNO', 'ENZO', 'VALENTIN', 'BAUTISTA', 'SANTINO', 'BENJAMIN'
];

const PROFESSIONS = [
  'MEDICO', 'INGENIERO', 'ABOGADO', 'CONTADOR', 'ARQUITECTO', 'FARMACEUTICO',
  'ODONTOLOGO', 'BIOQUIMICO', 'DOCENTE', 'INVESTIGADOR', 'PSICOLOGO', 'VETERINARIO',
  'LICENCIADO', 'PROFESOR', 'DIRECTOR', 'GERENTE', 'ESCRITOR', 'AUTOR', 'PROVEEDOR',
  'FUNCIONARIO', 'MAGISTRADO', 'AUTORIDAD'
];

const ORGANIZATIONS = [
  'UNIVERSIDAD', 'CONICET', 'HOSPITAL', 'MINISTERIO', 'SALUD', 'JUSTICIA',
  'SRL', 'SOCIEDAD ANONIMA', 'AUDIENCIAS', 'COMPR AR', 'DNDA', 'SUPERINTENDENCIA'
];

const GEOGRAPHIES = [
  'CABA', 'BUENOS AIRES', 'CORDOBA', 'SANTA FE', 'MENDOZA', 'TUCUMAN', 'ENTRE RIOS',
  'SALTA', 'CHACO', 'CORRIENTES', 'SAN JUAN', 'JUJUY', 'RIO NEGRO', 'NEUQUEN', 'ARGENTINA'
];

export function buildBenchmarkQuerySet(targetCount = 50000) {
  const queries = [];
  const seen = new Set();

  function add(q) {
    const trimmed = q.trim().replace(/\s+/g, ' ');
    if (trimmed && !seen.has(trimmed) && queries.length < targetCount) {
      seen.add(trimmed);
      queries.push(trimmed);
    }
  }

  // 1. Partial names / Single tokens (Surnames)
  for (const sn of SURNAMES) add(sn);

  // 2. Partial names / Single tokens (First Names)
  for (const fn of FIRST_NAMES) add(fn);

  // 3. Single professions
  for (const p of PROFESSIONS) add(p);

  // 4. Single organizations
  for (const o of ORGANIZATIONS) add(o);

  // 5. Profession + Geography
  for (const p of PROFESSIONS) {
    for (const g of GEOGRAPHIES) {
      add(`${p} ${g}`);
    }
  }

  // 6. Organization + Role / Profession
  for (const o of ORGANIZATIONS) {
    for (const p of PROFESSIONS) {
      add(`${p} ${o}`);
    }
  }

  // 7. Full Names (First + Surname)
  for (const fn of FIRST_NAMES) {
    for (const sn of SURNAMES) {
      add(`${fn} ${sn}`);
      if (queries.length >= targetCount) break;
    }
    if (queries.length >= targetCount) break;
  }

  // 8. Surname + Profession
  for (const sn of SURNAMES) {
    for (const p of PROFESSIONS) {
      add(`${sn} ${p}`);
      if (queries.length >= targetCount) break;
    }
    if (queries.length >= targetCount) break;
  }

  // 9. Surname + Geography
  for (const sn of SURNAMES) {
    for (const g of GEOGRAPHIES) {
      add(`${sn} ${g}`);
      if (queries.length >= targetCount) break;
    }
    if (queries.length >= targetCount) break;
  }

  // 10. Accent variants
  const accents = [
    ['GOMEZ', 'GÓMEZ'], ['RODRIGUEZ', 'RODRÍGUEZ'], ['MARTINEZ', 'MARTÍNEZ'],
    ['DIAZ', 'DÍAZ'], ['LOPEZ', 'LÓPEZ'], ['PEREZ', 'PÉREZ'], ['NUÑEZ', 'NUNEZ'],
    ['CORDOBA', 'CÓRDOBA'], ['AVILA', 'ÁVILA'], ['CACERES', 'CÁCERES']
  ];
  for (const [a, b] of accents) {
    add(a);
    add(b);
  }

  // 11. Multi-token queries (First + Last + Prof/Geo)
  let fI = 0, sI = 0, pI = 0;
  while (queries.length < targetCount) {
    const fn = FIRST_NAMES[fI % FIRST_NAMES.length];
    const sn = SURNAMES[sI % SURNAMES.length];
    const pr = PROFESSIONS[pI % PROFESSIONS.length];
    add(`${fn} ${sn} ${pr}`);
    fI++;
    sI = (sI + 1) % SURNAMES.length;
    pI = (pI + 1) % PROFESSIONS.length;
  }

  return queries;
}

export function generateAndFreezeQuerySet(targetCount = 50000) {
  const outputDir = path.resolve('reports/atlas/certification');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, 'final_benchmark_query_set.json');

  const queryList = buildBenchmarkQuerySet(targetCount);
  const jsonContent = JSON.stringify(queryList, null, 2);
  const hash = crypto.createHash('sha256').update(jsonContent).digest('hex').toUpperCase();

  const manifest = {
    BENCHMARK_QUERY_COUNT: queryList.length,
    BENCHMARK_QUERY_SET_HASH: hash,
    GENERATED_AT: new Date().toISOString(),
    REPRESENTATIVE_PATTERNS: [
      'EXACT_FULL_NAMES',
      'PARTIAL_NAMES',
      'NAME_PROFESSION',
      'NAME_ORGANIZATION',
      'PROFESSION_GEOGRAPHY',
      'ORGANIZATION_ROLE',
      'PUBLIC_INSTITUTIONAL_CONTEXT',
      'COMMON_NAMES_AMBIGUITY',
      'ACCENT_NORMALIZATION_VARIANTS',
      'MULTI_TOKEN_SEARCHES'
    ],
    SAMPLE_QUERIES: queryList.slice(0, 10)
  };

  fs.writeFileSync(outputPath, jsonContent);
  fs.writeFileSync(path.join(outputDir, 'final_benchmark_query_set.manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`✔ FINAL_BENCHMARK_QUERY_SET frozen:`);
  console.log(`  BENCHMARK_QUERY_COUNT = ${queryList.length}`);
  console.log(`  BENCHMARK_QUERY_SET_HASH = ${hash}`);
  console.log(`  Saved to: ${outputPath}`);

  return {
    queryList,
    queryCount: queryList.length,
    querySetHash: hash
  };
}

if (process.argv[1]?.endsWith('generate_final_benchmark_query_set.mjs')) {
  generateAndFreezeQuerySet(50000);
}
