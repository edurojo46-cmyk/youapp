/**
 * Official CABA Geography Catalog
 * 15 Communes, 48 Official Neighborhoods, Hierarchy & Aliases
 * Source: GCBA / Dirección General de Estadística y Censos / Censo 2022
 */

export interface CabaNeighborhood {
  id: string;
  name: string;
  normalized_name: string;
  commune_id: string;
  commune_number: number;
  official_population_2022?: number;
  center_lat: number;
  center_lng: number;
  aliases: string[];
  key_streets_anchors: string[];
}

export interface CabaCommune {
  id: string;
  number: number;
  name: string;
  neighborhood_ids: string[];
  official_population_2022: number;
  junta_headquarters_address: string;
}

export const CABA_COMMUNES: CabaCommune[] = [
  { id: 'caba_comuna_1', number: 1, name: 'Comuna 1', neighborhood_ids: ['retir', 'san_nicolas', 'puerto_madero', 'san_telmo', 'montserrat', 'constitucion'], official_population_2022: 223282, junta_headquarters_address: 'Humberto 1º 250' },
  { id: 'caba_comuna_2', number: 2, name: 'Comuna 2', neighborhood_ids: ['recoleta'], official_population_2022: 158368, junta_headquarters_address: 'Pres. José E. Uriburu 1022' },
  { id: 'caba_comuna_3', number: 3, name: 'Comuna 3', neighborhood_ids: ['san_cristobal', 'balvanera'], official_population_2022: 195462, junta_headquarters_address: 'Junín 521' },
  { id: 'caba_comuna_4', number: 4, name: 'Comuna 4', neighborhood_ids: ['la_boca', 'barracas', 'parque_patricios', 'nueva_pompeya'], official_population_2022: 229240, junta_headquarters_address: 'Av. del Barco Centenera 2906' },
  { id: 'caba_comuna_5', number: 5, name: 'Comuna 5', neighborhood_ids: ['almagro', 'boedo'], official_population_2022: 193859, junta_headquarters_address: 'Plaza 435' },
  { id: 'caba_comuna_6', number: 6, name: 'Comuna 6', neighborhood_ids: ['caballito'], official_population_2022: 203043, junta_headquarters_address: 'Av. Patricias Argentinas 277' },
  { id: 'caba_comuna_7', number: 7, name: 'Comuna 7', neighborhood_ids: ['flores', 'parque_chacabuco'], official_population_2022: 215896, junta_headquarters_address: 'Av. Rivadavia 7202' },
  { id: 'caba_comuna_8', number: 8, name: 'Comuna 8', neighborhood_ids: ['villa_soldati', 'villa_riachuelo', 'villa_lugano'], official_population_2022: 204601, junta_headquarters_address: 'Av. Roca 5252' },
  { id: 'caba_comuna_9', number: 9, name: 'Comuna 9', neighborhood_ids: ['liniers', 'mataderos', 'parque_avellaneda'], official_population_2022: 169525, junta_headquarters_address: 'Timoteo Gordillo 2212' },
  { id: 'caba_comuna_10', number: 10, name: 'Comuna 10', neighborhood_ids: ['villa_real', 'monte_castro', 'versalles', 'floresta', 'velez_sarsfield', 'villa_luro'], official_population_2022: 171697, junta_headquarters_address: 'Bacacay 3968' },
  { id: 'caba_comuna_11', number: 11, name: 'Comuna 11', neighborhood_ids: ['villa_general_mitre', 'villa_devoto', 'villa_del_parque', 'villa_santa_rita'], official_population_2022: 203491, junta_headquarters_address: 'Av. Francisco Beiró 4680' },
  { id: 'caba_comuna_12', number: 12, name: 'Comuna 12', neighborhood_ids: ['coghlan', 'saavedra', 'villa_urquiza', 'villa_pueyrredon'], official_population_2022: 236294, junta_headquarters_address: 'Miller 2751' },
  { id: 'caba_comuna_13', number: 13, name: 'Comuna 13', neighborhood_ids: ['nunez', 'belgrano', 'colegiales'], official_population_2022: 264385, junta_headquarters_address: 'Av. Cabildo 3067' },
  { id: 'caba_comuna_14', number: 14, name: 'Comuna 14', neighborhood_ids: ['palermo'], official_population_2022: 248635, junta_headquarters_address: 'Beruti 3325' },
  { id: 'caba_comuna_15', number: 15, name: 'Comuna 15', neighborhood_ids: ['chacarita', 'villa_crespo', 'la_paternal', 'villa_ortuzar', 'agronomia', 'parque_chas'], official_population_2022: 196876, junta_headquarters_address: 'Av. Córdoba 5690' }
];

export const CABA_48_NEIGHBORHOODS: CabaNeighborhood[] = [
  // Comuna 6 (Pilot)
  { id: 'caballito', name: 'Caballito', normalized_name: 'CABALLITO', commune_id: 'caba_comuna_6', commune_number: 6, official_population_2022: 203043, center_lat: -34.6186, center_lng: -58.4428, aliases: ['CABALLITO', 'COMUNA 6', 'PARQUE CENTENARIO', 'PARQUE RIVADAVIA', 'PRIMERA JUNTA', 'ACOYTE Y RIVADAVIA'], key_streets_anchors: ['Rivadavia', 'Díaz Vélez', 'Pedro Goyena', 'Acoyte', 'Hidalgo', 'Puán', 'Ángel Gallardo', 'Formosa', 'Senillosa', 'Campichuelo', 'Rosario', 'Guayaquil', 'La Plata', 'García Lorca'] },

  // Comuna 1
  { id: 'retir', name: 'Retiro', normalized_name: 'RETIRO', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.5925, center_lng: -58.3758, aliases: ['RETIRO', 'PLAZA SAN MARTIN', 'ESTACION RETIRO', 'CATALINAS'], key_streets_anchors: ['Libertador', 'Leandro N. Alem', 'Santa Fe', 'Florida', 'Esmeralda'] },
  { id: 'san_nicolas', name: 'San Nicolás', normalized_name: 'SAN NICOLAS', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.6033, center_lng: -58.3817, aliases: ['SAN NICOLAS', 'CENTRO', 'TRIBUNALES', 'OBELISCO', 'MICROCENTRO'], key_streets_anchors: ['Corrientes', '9 de Julio', 'Diagonal Norte', 'Lavalle', 'Talcahuano'] },
  { id: 'puerto_madero', name: 'Puerto Madero', normalized_name: 'PUERTO MADERO', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.6111, center_lng: -58.3639, aliases: ['PUERTO MADERO', 'DIQUES PUERTO MADERO', 'COSTANERA SUR'], key_streets_anchors: ['Juana Manso', 'Alicia Moreau de Justo', 'Aimé Painé', 'Pierina Dealessi'] },
  { id: 'san_telmo', name: 'San Telmo', normalized_name: 'SAN TELMO', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.6214, center_lng: -58.3731, aliases: ['SAN TELMO', 'PLAZA DORREGO', 'PARQUE LEZAMA'], key_streets_anchors: ['Defensa', 'San Juan', 'Independencia', 'Paseo Colón'] },
  { id: 'montserrat', name: 'Montserrat', normalized_name: 'MONTSERRAT', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.6128, center_lng: -58.3847, aliases: ['MONTSERRAT', 'MONSERRAT', 'PLAZA DE MAYO', 'CONGRESO'], key_streets_anchors: ['Avenida de Mayo', 'Belgrano', 'Entre Ríos', 'Piedras'] },
  { id: 'constitucion', name: 'Constitución', normalized_name: 'CONSTITUCION', commune_id: 'caba_comuna_1', commune_number: 1, center_lat: -34.6278, center_lng: -58.3817, aliases: ['CONSTITUCION', 'ESTACION CONSTITUCION', 'PLAZA CONSTITUCION'], key_streets_anchors: ['Brasil', 'Garay', 'Lima', 'San Juan'] },

  // Comuna 2
  { id: 'recoleta', name: 'Recoleta', normalized_name: 'RECOLETA', commune_id: 'caba_comuna_2', commune_number: 2, official_population_2022: 158368, center_lat: -34.5889, center_lng: -58.3961, aliases: ['RECOLETA', 'BARRIO NORTE', 'FACULTAD DE MEDICINA', 'PLAZA FRANCIA'], key_streets_anchors: ['Santa Fe', 'Callao', 'Las Heras', 'Alvear', 'Pueyrredón', 'Parera', 'Quintana', 'Vicente López'] },

  // Comuna 3
  { id: 'balvanera', name: 'Balvanera', normalized_name: 'BALVANERA', commune_id: 'caba_comuna_3', commune_number: 3, center_lat: -34.6097, center_lng: -58.4017, aliases: ['BALVANERA', 'ONCE', 'ABASTO', 'PLAZA MISERERE'], key_streets_anchors: ['Rivadavia', 'Pueyrredón', 'Corrientes', 'Jujuy', 'Belgrano'] },
  { id: 'san_cristobal', name: 'San Cristóbal', normalized_name: 'SAN CRISTOBAL', commune_id: 'caba_comuna_3', commune_number: 3, center_lat: -34.6236, center_lng: -58.3986, aliases: ['SAN CRISTOBAL', 'SAN CRISTÓBAL'], key_streets_anchors: ['San Juan', 'Independencia', 'Jujuy', 'Entre Ríos'] },

  // Comuna 4
  { id: 'la_boca', name: 'La Boca', normalized_name: 'LA BOCA', commune_id: 'caba_comuna_4', commune_number: 4, center_lat: -34.6361, center_lng: -58.3647, aliases: ['LA BOCA', 'CAMINITO', 'BOMBONERA'], key_streets_anchors: ['Almirante Brown', 'Necochea', 'Pedro de Mendoza', 'Brandsen'] },
  { id: 'barracas', name: 'Barracas', normalized_name: 'BARRACAS', commune_id: 'caba_comuna_4', commune_number: 4, center_lat: -34.6436, center_lng: -58.3833, aliases: ['BARRACAS'], key_streets_anchors: ['Montes de Oca', 'Patricios', 'Suárez', 'Regimiento de Patricios'] },
  { id: 'parque_patricios', name: 'Parque Patricios', normalized_name: 'PARQUE PATRICIOS', commune_id: 'caba_comuna_4', commune_number: 4, center_lat: -34.6358, center_lng: -58.4042, aliases: ['PARQUE PATRICIOS', 'DISTRITO TECNOLOGICO'], key_streets_anchors: ['Caseros', 'Amancio Alcorta', 'Brasil', 'Almafuerte'] },
  { id: 'nueva_pompeya', name: 'Nueva Pompeya', normalized_name: 'NUEVA POMPEYA', commune_id: 'caba_comuna_4', commune_number: 4, center_lat: -34.6514, center_lng: -58.4167, aliases: ['NUEVA POMPEYA', 'POMPEYA', 'PUENTE ALSINA'], key_streets_anchors: ['Sáenz', 'Amancio Alcorta', 'La Plata', 'Chiclana'] },

  // Comuna 5
  { id: 'almagro', name: 'Almagro', normalized_name: 'ALMAGRO', commune_id: 'caba_comuna_5', commune_number: 5, center_lat: -34.6108, center_lng: -58.4194, aliases: ['ALMAGRO'], key_streets_anchors: ['Rivadavia', 'Corrientes', 'Medrano', 'Castro Barros', 'Díaz Vélez'] },
  { id: 'boedo', name: 'Boedo', normalized_name: 'BOEDO', commune_id: 'caba_comuna_5', commune_number: 5, center_lat: -34.6292, center_lng: -58.4167, aliases: ['BOEDO', 'SAN LORENZO DE ALMAGRO'], key_streets_anchors: ['Boedo', 'San Juan', 'Independencia', 'La Plata'] },

  // Comuna 7
  { id: 'flores', name: 'Flores', normalized_name: 'FLORES', commune_id: 'caba_comuna_7', commune_number: 7, center_lat: -34.6333, center_lng: -58.4611, aliases: ['FLORES', 'PLAZA FLORES', 'SAN JOSE DE FLORES'], key_streets_anchors: ['Rivadavia', 'Nazca', 'San Pedrito', 'Directorio', 'Avellaneda'] },
  { id: 'parque_chacabuco', name: 'Parque Chacabuco', normalized_name: 'PARQUE CHACABUCO', commune_id: 'caba_comuna_7', commune_number: 7, center_lat: -34.6333, center_lng: -58.4389, aliases: ['PARQUE CHACABUCO'], key_streets_anchors: ['Asamblea', 'Eva Perón', 'Curapaligüe', 'La Plata'] },

  // Comuna 8
  { id: 'villa_soldati', name: 'Villa Soldati', normalized_name: 'VILLA SOLDATI', commune_id: 'caba_comuna_8', commune_number: 8, center_lat: -34.6667, center_lng: -58.4417, aliases: ['VILLA SOLDATI', 'PARQUE DE LA CIUDAD'], key_streets_anchors: ['Cruz', 'Roca', 'Escalada', 'Mariano Acosta'] },
  { id: 'villa_riachuelo', name: 'Villa Riachuelo', normalized_name: 'VILLA RIACHUELO', commune_id: 'caba_comuna_8', commune_number: 8, center_lat: -34.6861, center_lng: -58.4639, aliases: ['VILLA RIACHUELO', 'AUTODROMO'], key_streets_anchors: ['Roca', 'Fernández de la Cruz', 'General Paz'] },
  { id: 'villa_lugano', name: 'Villa Lugano', normalized_name: 'VILLA LUGANO', commune_id: 'caba_comuna_8', commune_number: 8, center_lat: -34.6722, center_lng: -58.4722, aliases: ['VILLA LUGANO', 'LUGANO'], key_streets_anchors: ['Roca', 'Riestra', 'Murguiondo', 'Dellepiane'] },

  // Comuna 9
  { id: 'liniers', name: 'Liniers', normalized_name: 'LINIERS', commune_id: 'caba_comuna_9', commune_number: 9, center_lat: -34.6458, center_lng: -58.5194, aliases: ['LINIERS', 'ESTACION LINIERS', 'SAN CAYETANO'], key_streets_anchors: ['Rivadavia', 'General Paz', 'Lisandro de la Torre', 'Emilio Castro'] },
  { id: 'mataderos', name: 'Mataderos', normalized_name: 'MATADEROS', commune_id: 'caba_comuna_9', commune_number: 9, center_lat: -34.6583, center_lng: -58.5028, aliases: ['MATADEROS', 'FERIA DE MATADEROS', 'NUEVA CHICAGO'], key_streets_anchors: ['Alberdi', 'Directorio', 'General Paz', 'Los Corrales'] },
  { id: 'parque_avellaneda', name: 'Parque Avellaneda', normalized_name: 'PARQUE AVELLANEDA', commune_id: 'caba_comuna_9', commune_number: 9, center_lat: -34.6444, center_lng: -58.4778, aliases: ['PARQUE AVELLANEDA'], key_streets_anchors: ['Directorio', 'Olivera', 'Alberdi', 'Lacarra'] },

  // Comuna 10
  { id: 'villa_real', name: 'Villa Real', normalized_name: 'VILLA REAL', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6194, center_lng: -58.5250, aliases: ['VILLA REAL'], key_streets_anchors: ['Beiró', 'General Paz', 'Lope de Vega'] },
  { id: 'monte_castro', name: 'Monte Castro', normalized_name: 'MONTE CASTRO', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6194, center_lng: -58.4972, aliases: ['MONTE CASTRO'], key_streets_anchors: ['Álvarez Jonte', 'Lope de Vega', 'Segurola'] },
  { id: 'versalles', name: 'Versalles', normalized_name: 'VERSALLES', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6278, center_lng: -58.5222, aliases: ['VERSALLES'], key_streets_anchors: ['Juan B. Justo', 'General Paz', 'Álvarez Jonte'] },
  { id: 'floresta', name: 'Floresta', normalized_name: 'FLORESTA', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6306, center_lng: -58.4833, aliases: ['FLORESTA', 'ALL BOYS'], key_streets_anchors: ['Rivadavia', 'Avellaneda', 'Segurola', 'Juan B. Justo'] },
  { id: 'velez_sarsfield', name: 'Vélez Sarsfield', normalized_name: 'VELEZ SARSFIELD', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6389, center_lng: -58.4889, aliases: ['VELEZ SARSFIELD', 'VÉLEZ SARSFIELD'], key_streets_anchors: ['Rivadavia', 'Juan B. Justo', 'Lope de Vega'] },
  { id: 'villa_luro', name: 'Villa Luro', normalized_name: 'VILLA LURO', commune_id: 'caba_comuna_10', commune_number: 10, center_lat: -34.6389, center_lng: -58.5028, aliases: ['VILLA LURO'], key_streets_anchors: ['Rivadavia', 'Lope de Vega', 'Juan B. Justo', 'Emilio Castro'] },

  // Comuna 11
  { id: 'villa_general_mitre', name: 'Villa General Mitre', normalized_name: 'VILLA GENERAL MITRE', commune_id: 'caba_comuna_11', commune_number: 11, center_lat: -34.6083, center_lng: -58.4722, aliases: ['VILLA GRAL MITRE', 'VILLA MITRE'], key_streets_anchors: ['Juan B. Justo', 'San Martín', 'Gaona', 'Donato Álvarez'] },
  { id: 'villa_devoto', name: 'Villa Devoto', normalized_name: 'VILLA DEVOTO', commune_id: 'caba_comuna_11', commune_number: 11, center_lat: -34.6000, center_lng: -58.5139, aliases: ['VILLA DEVOTO', 'DEVOTO', 'PLAZA ARENALES'], key_streets_anchors: ['San Martín', 'Beiró', 'Lincoln', 'Chivilcoy', 'Mosconi'] },
  { id: 'villa_del_parque', name: 'Villa del Parque', normalized_name: 'VILLA DEL PARQUE', commune_id: 'caba_comuna_11', commune_number: 11, center_lat: -34.6056, center_lng: -58.4917, aliases: ['VILLA DEL PARQUE', 'CUENCA'], key_streets_anchors: ['Cuenca', 'Nazca', 'Álvarez Jonte', 'Beiró'] },
  { id: 'villa_santa_rita', name: 'Villa Santa Rita', normalized_name: 'VILLA SANTA RITA', commune_id: 'caba_comuna_11', commune_number: 11, center_lat: -34.6139, center_lng: -58.4833, aliases: ['VILLA SANTA RITA'], key_streets_anchors: ['Nazca', 'Álvarez Jonte', 'Juan B. Justo', 'Cuenca'] },

  // Comuna 12
  { id: 'coghlan', name: 'Coghlan', normalized_name: 'COGHLAN', commune_id: 'caba_comuna_12', commune_number: 12, center_lat: -34.5667, center_lng: -58.4722, aliases: ['COGHLAN', 'HOSPITAL PIROVANO'], key_streets_anchors: ['Monroe', 'Congreso', 'Balbín', 'Washington'] },
  { id: 'saavedra', name: 'Saavedra', normalized_name: 'SAAVEDRA', commune_id: 'caba_comuna_12', commune_number: 12, center_lat: -34.5528, center_lng: -58.4889, aliases: ['SAAVEDRA', 'PARQUE SAAVEDRA', 'DOT BAIRES'], key_streets_anchors: ['Cabildo', 'General Paz', 'García del Río', 'Balbín'] },
  { id: 'villa_urquiza', name: 'Villa Urquiza', normalized_name: 'VILLA URQUIZA', commune_id: 'caba_comuna_12', commune_number: 12, center_lat: -34.5750, center_lng: -58.4889, aliases: ['VILLA URQUIZA', 'URQUIZA', 'TRIUNVIRATO'], key_streets_anchors: ['Triunvirato', 'Monroe', 'Congreso', 'Olazábal'] },
  { id: 'villa_pueyrredon', name: 'Villa Pueyrredón', normalized_name: 'VILLA PUEYRREDON', commune_id: 'caba_comuna_12', commune_number: 12, center_lat: -34.5889, center_lng: -58.5028, aliases: ['VILLA PUEYRREDON', 'VILLA PUEYRREDÓN'], key_streets_anchors: ['Mosconi', 'Constituyentes', 'Albarellos'] },

  // Comuna 13
  { id: 'nunez', name: 'Núñez', normalized_name: 'NUNEZ', commune_id: 'caba_comuna_13', commune_number: 13, center_lat: -34.5444, center_lng: -58.4611, aliases: ['NUNEZ', 'NÚÑEZ', 'CUIDAD UNIVERSITARIA', 'RIVER PLATE'], key_streets_anchors: ['Cabildo', 'Libertador', 'General Paz', 'Crisólogo Larralde'] },
  { id: 'belgrano', name: 'Belgrano', normalized_name: 'BELGRANO', commune_id: 'caba_comuna_13', commune_number: 13, center_lat: -34.5625, center_lng: -58.4564, aliases: ['BELGRANO', 'BARRANCAS DE BELGRANO', 'BELGRANO R', 'BELGRANO C', 'BARRIO CHINO'], key_streets_anchors: ['Cabildo', 'Juramento', 'Libertador', 'Cramer', 'Federico Lacroze', 'Monroe'] },
  { id: 'colegiales', name: 'Colegiales', normalized_name: 'COLEGIALES', commune_id: 'caba_comuna_13', commune_number: 13, center_lat: -34.5778, center_lng: -58.4500, aliases: ['COLEGIALES'], key_streets_anchors: ['Federico Lacroze', 'Álvarez Thomas', 'Elcano', 'Cramer'] },

  // Comuna 14
  { id: 'palermo', name: 'Palermo', normalized_name: 'PALERMO', commune_id: 'caba_comuna_14', commune_number: 14, official_population_2022: 248635, center_lat: -34.5814, center_lng: -58.4211, aliases: ['PALERMO', 'PALERMO SOHO', 'PALERMO HOLLYWOOD', 'PALERMO CHICO', 'LAS CANITAS', 'BOTANICO'], key_streets_anchors: ['Santa Fe', 'Libertador', 'Juan B. Justo', 'Coronel Díaz', 'Scalabrini Ortiz', 'Honduras', 'Serrano', 'Palermo'] },

  // Comuna 15
  { id: 'chacarita', name: 'Chacarita', normalized_name: 'CHACARITA', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5889, center_lng: -58.4528, aliases: ['CHACARITA', 'CEMENTERIO DE LA CHACARITA'], key_streets_anchors: ['Corrientes', 'Federico Lacroze', 'Dorrego', 'Guzmán'] },
  { id: 'villa_crespo', name: 'Villa Crespo', normalized_name: 'VILLA CRESPO', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5986, center_lng: -58.4389, aliases: ['VILLA CRESPO', 'ATLANTA'], key_streets_anchors: ['Corrientes', 'Scalabrini Ortiz', 'Juan B. Justo', 'Warnes'] },
  { id: 'la_paternal', name: 'La Paternal', normalized_name: 'LA PATERNAL', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5986, center_lng: -58.4694, aliases: ['LA PATERNAL', 'PATERNAL', 'ARGENTINOS JUNIORS'], key_streets_anchors: ['San Martín', 'Juan B. Justo', 'Warnes', 'Donato Álvarez'] },
  { id: 'villa_ortuzar', name: 'Villa Ortúzar', normalized_name: 'VILLA ORTUZAR', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5806, center_lng: -58.4722, aliases: ['VILLA ORTUZAR', 'VILLA ORTÚZAR'], key_streets_anchors: ['Triunvirato', 'Álvarez Thomas', 'Chorroarín'] },
  { id: 'agronomia', name: 'Agronomía', normalized_name: 'AGRONOMIA', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5917, center_lng: -58.4861, aliases: ['AGRONOMIA', 'AGRONOMÍA', 'FACULTAD DE AGRONOMIA'], key_streets_anchors: ['San Martín', 'Constituyentes', 'Chorroarín', 'Beiró'] },
  { id: 'parque_chas', name: 'Parque Chas', normalized_name: 'PARQUE CHAS', commune_id: 'caba_comuna_15', commune_number: 15, center_lat: -34.5833, center_lng: -58.4806, aliases: ['PARQUE CHAS'], key_streets_anchors: ['Triunvirato', 'La Pampa', 'Constituyentes'] }
];
