/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AdminPersons from '../pages/admin/atlas/AdminPersons';
import { supabase } from '../lib/supabase';

// Mock Supabase RPC
vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}));

const mockRpcData = {
  items: [
    {
      person_id: '11111111-1111-1111-1111-111111111111',
      full_name: 'Valeria Rossi',
      status: 'ACTIVE',
      created_at: '2026-09-08T00:00:00Z',
      coverage: {
        email_known: true,
        phone_known: true,
        telegram_known: false,
        instagram_known: false,
        linkedin_known: false,
        identity_known: true
      },
      identifiers: [
        {
          identifier_type: 'EMAIL',
          display_value: 'valeria.rossi@example.com',
          verification_status: 'VERIFIED'
        }
      ],
      attributes: {
        residence_city: { value: 'Buenos Aires', status: 'KNOWN', confidence: 0.9 },
        residence_neighborhood: { value: 'Recoleta', status: 'KNOWN', confidence: 0.9 },
        profession: { value: 'empresaria', status: 'KNOWN', confidence: 0.85 },
        company: { value: 'Rossi Capital', status: 'KNOWN', confidence: 0.85 }
      },
      age: 46,
      product_fit: {
        fit_level: 'VERY_HIGH',
        fit_score: 92.5,
        evidence_count: 3,
        reason_codes: ['HIGH_INTENT', 'SENIOR_ROLE']
      },
      nba: {
        recommended_action: 'EMAIL',
        recommended_channel: 'EMAIL',
        decision_status: 'DO_NOW',
        priority_score: 88,
        estimated_action_cost: '0.00',
        reason_codes: ['FIT_AND_ELIGIBLE']
      },
      channel_eligibility: [
        {
          channel: 'EMAIL',
          action_type: 'EMAIL_SEND',
          eligibility_status: 'ELIGIBLE'
        }
      ],
      intent: {
        topic: 'cloud_architecture',
        intent_level: 'HIGH',
        intent_score: 85.0
      },
      interest: null,
      has_photo_evidence: true,
      photo_displayable: false
    }
  ],
  total_count: 1,
  total_pages: 1,
  page: 1,
  page_size: 25
};

describe('Admin Persons Search UI Certification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: mockRpcData,
      error: null
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('1. SEARCH_INPUT_RENDERS: Visible search input with placeholder "Buscar por nombre..."', async () => {
    render(<AdminPersons />);
    const input = screen.getByPlaceholderText('Buscar por nombre...');
    expect(input).toBeDefined();
    expect(input).toBeInstanceOf(HTMLInputElement);
  });

  it('2. BUSCAR_BUTTON_RENDERS: Visible BUSCAR button renders in hero search bar', async () => {
    render(<AdminPersons />);
    const btn = document.getElementById('admin-person-search-button');
    expect(btn).toBeDefined();
    await waitFor(() => {
      const buscarBtn = screen.getByRole('button', { name: /BUSCAR/i });
      expect(buscarBtn).toBeDefined();
      expect(buscarBtn.textContent).toContain('BUSCAR');
    });
  });

  it('3. PARTIAL_NAME_DEBOUNCE: Typing partial name "rossi" updates query and triggers RPC with p_search_query="rossi"', async () => {
    render(<AdminPersons />);

    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'rossi' } });

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: 'rossi'
        })
      );
    }, { timeout: 1500 });
  });

  it('4. CLICK_BUSCAR_EXECUTION: Clicking BUSCAR button immediately triggers search flow', async () => {
    render(<AdminPersons />);
    
    // Initial fetch on mount
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'Valeria' } });

    const buscarBtn = screen.getByRole('button', { name: /BUSCAR/i });
    fireEvent.click(buscarBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: 'Valeria',
          p_page: 1
        })
      );
    });
  });

  it('5. ENTER_KEY_SEARCH: Pressing Enter key on search input triggers search', async () => {
    render(<AdminPersons />);
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'Carlos' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: 'Carlos',
          p_page: 1
        })
      );
    });
  });

  it('6. PAGINATION_RESET: Changing query or manual search resets page to 1', async () => {
    render(<AdminPersons />);
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());

    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'New Query' } });

    const buscarBtn = screen.getByRole('button', { name: /BUSCAR/i });
    fireEvent.click(buscarBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: 'New Query',
          p_page: 1
        })
      );
    });
  });

  it('7. SEARCH_AND_ACTIVE_FILTERS: Search query coordinates with filters (Status, Coverage, Fit, NBA)', async () => {
    render(<AdminPersons />);
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());

    // Set search term
    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'rossi' } });

    // Set Product Fit filter
    const selects = screen.getAllByRole('combobox');
    const fitSelect = selects.find((s) => (s as HTMLSelectElement).value === '' || (s as HTMLSelectElement).options[1]?.value === 'VERY_HIGH');
    if (fitSelect) {
      fireEvent.change(fitSelect, { target: { value: 'VERY_HIGH' } });
    }

    // Toggle Email chip
    const emailChip = screen.getByRole('button', { name: /✉ Con Email/i });
    fireEvent.click(emailChip);

    const buscarBtn = document.getElementById('admin-person-search-button') || screen.getByRole('button', { name: /BUSCAR|BUSCANDO/i });
    if (buscarBtn) fireEvent.click(buscarBtn);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: 'rossi',
          p_status: 'ACTIVE',
          p_coverage_email: true,
          p_product_fit_level: 'VERY_HIGH'
        })
      );
    });
  });

  it('8. CLEAR_BUTTON_RESTORES_NORMAL_LISTING: Clear (X) resets search input and passes p_search_query=null', async () => {
    render(<AdminPersons />);
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1));

    const input = screen.getByPlaceholderText('Buscar por nombre...');
    fireEvent.change(input, { target: { value: 'rossi' } });

    // Clear button should now be visible
    const clearBtn = screen.getByTitle('Limpiar búsqueda');
    expect(clearBtn).toBeDefined();

    fireEvent.click(clearBtn);

    expect((input as HTMLInputElement).value).toBe('');

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.objectContaining({
          p_search_query: null,
          p_page: 1
        })
      );
    });
  });

  it('9. IMMUTABLE_BACKEND_CONTRACT: Uses exact RPC public.search_canonical_persons_v1 without modifying DB contract', async () => {
    render(<AdminPersons />);
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith(
        'search_canonical_persons_v1',
        expect.any(Object)
      );
    });
  });
});
