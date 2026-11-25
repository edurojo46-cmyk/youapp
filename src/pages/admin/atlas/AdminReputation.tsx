import React from 'react';
import { AtlasReputationDashboard } from '../../../components/telemetry/AtlasReputationDashboard';

const AdminReputation: React.FC = () => {
  return (
    <div style={{ padding: '0.5rem 0' }}>
      <AtlasReputationDashboard domain="youapp.com" />
    </div>
  );
};

export default AdminReputation;
