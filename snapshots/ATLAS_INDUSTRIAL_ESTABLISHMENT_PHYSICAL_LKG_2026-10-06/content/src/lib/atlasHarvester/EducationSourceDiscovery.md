# Education Source Discovery Catalog

This document tracks legitimate public education sources mapped for future Atlas integration.

## 1. GCBA Ministry of Education (Open Data)
- **SOURCE_NAME**: Buenos Aires Data - Nómina Docente GCBA
- **SOURCE_URL**: https://data.buenosaires.gob.ar/dataset/
- **ACCESS_METHOD**: API / BULK (CSV)
- **GEOGRAPHIC_SCOPE**: CABA
- **PERSON_LEVEL_DATA**: YES
- **ROLE_FIELDS**: Cargo, Nivel
- **PROFESSION_FIELDS**: Titulo (implied)
- **ORGANIZATION_FIELDS**: Establecimiento, Distrito Escolar
- **PUBLIC_ACCESS_STATUS**: OPEN
- **AUTOMATION_ALLOWED**: YES
- **ESTIMATED_PERSON_RECORDS**: ~60,000

## 2. National Universities Directories
- **SOURCE_NAME**: Directorio Académico UBA
- **SOURCE_URL**: Various UBA faculty websites
- **ACCESS_METHOD**: HTML SCRAPING
- **GEOGRAPHIC_SCOPE**: CABA
- **PERSON_LEVEL_DATA**: YES
- **ROLE_FIELDS**: Cargo Docente (Titular, Adjunto, JTP)
- **PROFESSION_FIELDS**: Profesión, Título
- **ORGANIZATION_FIELDS**: Facultad, Cátedra
- **PUBLIC_ACCESS_STATUS**: PUBLIC WEB
- **AUTOMATION_ALLOWED**: DEPENDS (Rate limits apply)
- **ESTIMATED_PERSON_RECORDS**: ~30,000
