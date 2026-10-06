export interface ProviderResult {
  status: 'ACCEPTED' | 'FAILED_PRE_ACCEPT' | 'AMBIGUOUS';
  provider_message_id?: string;
  reason?: string;
}

export interface CanaryProviderBoundary {
  execute(payload: any): Promise<ProviderResult>;
}

export class MockCanaryProvider implements CanaryProviderBoundary {
  constructor(private faultProfile: 'ACCEPT' | 'FAIL_PRE_ACCEPT' | 'TIMEOUT_AFTER_BOUNDARY' | 'RESET_AFTER_BOUNDARY' | 'UNKNOWN_OUTCOME') {}

  async execute(payload: any): Promise<ProviderResult> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 100));

    switch (this.faultProfile) {
      case 'ACCEPT':
        return { status: 'ACCEPTED', provider_message_id: 'mock-msg-' + Date.now() };
      case 'FAIL_PRE_ACCEPT':
        return { status: 'FAILED_PRE_ACCEPT', reason: 'Mock rejected before acceptance' };
      case 'TIMEOUT_AFTER_BOUNDARY':
      case 'RESET_AFTER_BOUNDARY':
      case 'UNKNOWN_OUTCOME':
        // These are cases where the network fails AFTER we sent the data,
        // so we do not know if the provider actually accepted it.
        return { status: 'AMBIGUOUS', reason: 'Mock network fault: ' + this.faultProfile };
      default:
        return { status: 'AMBIGUOUS', reason: 'Unrecognized fault profile' };
    }
  }
}
