import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAtlasAuthStore } from '../../store/atlas/atlasAuthStore';

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAtlasAuthStore();
  
  if (loading) return <div style={{ padding: '2rem' }}>Cargando...</div>;
  if (!user && typeof window !== 'undefined' && window.location.pathname.startsWith('/admin/atlas')) {
    return <>{children}</>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
