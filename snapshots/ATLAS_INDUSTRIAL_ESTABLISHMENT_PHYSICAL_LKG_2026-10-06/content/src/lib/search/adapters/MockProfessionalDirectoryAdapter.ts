import type { ExternalFilterCapabilities, ExternalPersonObservation, ExternalSearchFilters, IExternalPersonSourceAdapter } from '../IExternalPersonSourceAdapter';

export class MockProfessionalDirectoryAdapter implements IExternalPersonSourceAdapter {
  getAdapterId(): string {
    return 'MOCK_DIRECTORY';
  }

  getCapabilities(): ExternalFilterCapabilities {
    return {
      name_search: true,
      profession_filter: true,
      location_filter: true,
      age_filter: false, // The mock source does NOT support age filtering natively!
      company_filter: false,
      public_email: true,
      public_phone: false
    };
  }

  async search(filters: ExternalSearchFilters): Promise<ExternalPersonObservation[]> {
    // Simulating network delay
    await new Promise(resolve => setTimeout(resolve, 800));

    // The user requested only a SMALL deterministic dataset.
    // E.g. "Arquitecto + Palermo"
    
    // We only return results if they match the supported filters (Profession and Location)
    const profMatch = !filters.profession || filters.profession.toLowerCase().includes('arquitect');
    const locMatch = !filters.location || filters.location.toLowerCase().includes('palermo');
    
    if (!profMatch || !locMatch) {
      return [];
    }

    const now = new Date().toISOString();

    return [
      {
        source_system: 'MOCK',
        source_record_id: 'mock-1001',
        source_url: 'https://mock.example.com/profile/1001',
        observed_at: now,
        display_name: 'María Rossi',
        profession: 'Arquitecta',
        location: 'Palermo, CABA',
        company: 'Estudio Rossi',
        age: 35, // Confirmed age
        email: 'public_professional',
        phone: 'UNKNOWN',
        provenance_quality: 'HIGH',
        strong_identifiers: {
          professional_registry_id: 'CPAU-99999'
        }
      },
      {
        source_system: 'MOCK',
        source_record_id: 'mock-1002',
        source_url: 'https://mock.example.com/profile/1002',
        observed_at: now,
        display_name: 'Juan Pérez',
        profession: 'Arquitecto',
        location: 'Palermo, CABA',
        age: 'UNKNOWN', // Unknown age
        email: 'UNKNOWN',
        phone: 'UNKNOWN',
        provenance_quality: 'MEDIUM',
        strong_identifiers: {} // No strong identifier (will test POSSIBLE MATCH if atlas has a Juan Pérez)
      },
      {
        source_system: 'MOCK',
        source_record_id: 'mock-1003',
        observed_at: now,
        display_name: 'Valeria Gómez',
        profession: 'Arquitecta de Software',
        location: 'Palermo, CABA',
        age: 42, // Out of range age if queried 35-36, but since source doesn't filter age, it returns it anyway!
        email: 'UNKNOWN',
        phone: 'UNKNOWN',
        provenance_quality: 'MEDIUM',
        strong_identifiers: {}
      }
    ];
  }
}
