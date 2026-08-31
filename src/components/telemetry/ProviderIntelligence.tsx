import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Activity, BrainCircuit } from 'lucide-react';

export function ProviderIntelligence() {
  const [aggregates, setAggregates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data, error } = await supabase
        .from('telemetry_provider_conversion')
        .select('*')
        .eq('context_level', 'global')
        .order('learned_utility', { ascending: false });
        
      if (!error && data) {
        setAggregates(data);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto text-white">
      <header className="mb-8">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <BrainCircuit className="w-8 h-8 text-primary" />
          Provider Intelligence
        </h1>
        <p className="text-gray-400 mt-2">
          Telemetría y aprendizaje continuo del Capability Router.
        </p>
      </header>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-gray-400" />
          Global Utility (Learned vs Static)
        </h2>
        
        {loading ? (
          <div className="animate-pulse flex gap-4"><div className="h-4 bg-gray-700 w-1/4 rounded"></div></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-gray-400 border-b border-gray-700 text-sm">
                  <th className="pb-3 font-medium">Provider</th>
                  <th className="pb-3 font-medium text-right">Utility</th>
                  <th className="pb-3 font-medium text-right">Calls</th>
                  <th className="pb-3 font-medium text-right">Top20 Conv.</th>
                  <th className="pb-3 font-medium text-right">p95 Latency</th>
                  <th className="pb-3 font-medium text-center">Health</th>
                </tr>
              </thead>
              <tbody>
                {aggregates.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No hay datos agregados. Ejecuta búsquedas para sembrar telemetría.
                    </td>
                  </tr>
                ) : aggregates.map((row) => (
                  <tr key={row.provider} className="border-b border-gray-700/50 hover:bg-gray-750">
                    <td className="py-4 font-medium capitalize">{row.provider}</td>
                    <td className="py-4 text-right">
                      <span className="bg-primary/20 text-primary px-2 py-1 rounded text-sm font-bold">
                        {Math.round(row.learned_utility || 0)}
                      </span>
                    </td>
                    <td className="py-4 text-right text-gray-300">{row.calls?.toLocaleString() || 0}</td>
                    <td className="py-4 text-right text-gray-300">
                      {Math.round((row.top20_conversion || 0) * 100)}%
                    </td>
                    <td className="py-4 text-right text-gray-300">{Math.round(row.p95_latency_ms || row.avg_latency_ms || 0)}ms</td>
                    <td className="py-4 text-center">
                      <span className="text-green-400">🟢</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
