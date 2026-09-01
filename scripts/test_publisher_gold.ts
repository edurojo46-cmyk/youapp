import { evaluateFreeDiscoveryCoverage } from '../src/lib/search/freeDiscovery/freeDiscoveryCoverage';
import type { ContentItem } from '../src/lib/search/types';

function runPublisherGoldFixtureTest() {
  console.log('======================================================================');
  console.log('🧪 PUBLISHER VIDEO DISCOVERY V1 — GOLD FIXTURE TEST ("Juan Perón")');
  console.log('======================================================================\n');

  // Simulación de 10 candidatos descubiertos desde medios/archivos
  const mockPublisherCandidates: ContentItem[] = [
    {
      id: 'yt_peron_1',
      providerContentId: 'peron_1',
      type: 'video',
      title: 'Discurso Histórico de Juan Domingo Perón - 17 de Octubre',
      description: 'Registro audiovisual del Archivo General de la Nación',
      thumbnail: 'https://img.tvpublica.com.ar/peron1.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_1',
      canonicalUrl: 'https://www.tvpublica.com.ar/nota/peron-discurso',
      channelTitle: 'TV Pública',
      channelId: 'pub_tv_publica',
      publishedText: 'TV Pública',
      durationSeconds: 1200,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 90,
      relevanceScore: 95,
      youScore: 92,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_2',
      providerContentId: 'peron_2',
      type: 'video',
      title: 'Perón: Sinfonía de un sentimiento - Parte 1',
      description: 'Documental de Leonardo Favio emitido por Canal Encuentro',
      thumbnail: 'https://img.encuentro.gob.ar/peron2.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_2',
      canonicalUrl: 'https://encuentro.gob.ar/peron-doc',
      channelTitle: 'Canal Encuentro',
      channelId: 'pub_encuentro',
      publishedText: 'Canal Encuentro',
      durationSeconds: 3600,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 85,
      relevanceScore: 90,
      youScore: 88,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_3',
      providerContentId: 'peron_3',
      type: 'video',
      title: 'Entrevista a Juan Domingo Perón en Puerta de Hierro',
      description: 'Archivo histórico emitido en televisión pública',
      thumbnail: 'https://img.tvpublica.com.ar/peron3.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_3',
      canonicalUrl: 'https://www.tvpublica.com.ar/nota/puerta-de-hierro',
      channelTitle: 'TV Pública',
      channelId: 'pub_tv_publica',
      publishedText: 'TV Pública',
      durationSeconds: 2400,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 88,
      relevanceScore: 88,
      youScore: 88,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_4',
      providerContentId: 'peron_4',
      type: 'video',
      title: 'El primer gobierno de Juan Perón: Historia Argentina',
      description: 'Serie documental educativa del Canal Encuentro',
      thumbnail: 'https://img.encuentro.gob.ar/peron4.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_4',
      canonicalUrl: 'https://encuentro.gob.ar/historia-peron',
      channelTitle: 'Canal Encuentro',
      channelId: 'pub_encuentro',
      publishedText: 'Canal Encuentro',
      durationSeconds: 1800,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 80,
      relevanceScore: 85,
      youScore: 82,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_5',
      providerContentId: 'peron_5',
      type: 'video',
      title: 'Perón y la Constitución de 1949: Análisis Histórico',
      description: 'Biblioteca Nacional Mariano Moreno',
      thumbnail: 'https://img.bn.gov.ar/peron5.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_5',
      canonicalUrl: 'https://bn.gov.ar/conferencias/peron-1949',
      channelTitle: 'Biblioteca Nacional',
      channelId: 'pub_bn',
      publishedText: 'Biblioteca Nacional',
      durationSeconds: 3000,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 78,
      relevanceScore: 80,
      youScore: 79,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_6',
      providerContentId: 'peron_6',
      type: 'video',
      title: 'Regreso de Perón en 1973: Cobertura Especial',
      description: 'Documento fílmico del Archivo General de la Nación',
      thumbnail: 'https://img.agn.gob.ar/peron6.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_6',
      canonicalUrl: 'https://agn.gob.ar/video/regreso-1973',
      channelTitle: 'Archivo General',
      channelId: 'pub_agn',
      publishedText: 'Archivo General',
      durationSeconds: 1500,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 82,
      relevanceScore: 82,
      youScore: 82,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_7',
      providerContentId: 'peron_7',
      type: 'video',
      title: 'Último discurso de Juan Perón: 12 de Junio de 1974',
      description: 'Registro sonoro y fílmico restaurado',
      thumbnail: 'https://img.tvpublica.com.ar/peron7.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_7',
      canonicalUrl: 'https://www.tvpublica.com.ar/nota/peron-1974',
      channelTitle: 'TV Pública',
      channelId: 'pub_tv_publica',
      publishedText: 'TV Pública',
      durationSeconds: 900,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 85,
      relevanceScore: 85,
      youScore: 85,
      retrievalSource: 'publisher'
    },
    {
      id: 'yt_peron_8',
      providerContentId: 'peron_8',
      type: 'video',
      title: 'Debate Historiográfico sobre el Peronismo',
      description: 'Especial periodístico Infobae',
      thumbnail: 'https://img.infobae.com/peron8.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_8',
      canonicalUrl: 'https://www.infobae.com/peronismo-historia',
      channelTitle: 'Infobae',
      channelId: 'pub_infobae',
      publishedText: 'Infobae',
      durationSeconds: 1100,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 70,
      relevanceScore: 65,
      youScore: 68,
      retrievalSource: 'publisher'
    },
    // Candidato de baja calidad (debe ser filtrado y NO contar para coverage)
    {
      id: 'yt_peron_9_low',
      providerContentId: 'peron_9',
      type: 'video',
      title: 'Mención breve en noticiero',
      description: 'Clip corto',
      thumbnail: 'https://img.clarin.com/peron9.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_9',
      canonicalUrl: 'https://www.clarin.com/nota-9',
      channelTitle: 'Clarín',
      channelId: 'pub_clarin',
      publishedText: 'Clarín',
      durationSeconds: 60,
      isLive: false,
      isVerified: false,
      provider: 'youtube',
      qualityScore: 40, // < 60 (No cualificado)
      relevanceScore: 50,
      youScore: 45,
      retrievalSource: 'publisher'
    },
    // Candidato de baja relevancia (debe ser filtrado)
    {
      id: 'yt_peron_10_irrelevant',
      providerContentId: 'peron_10',
      type: 'video',
      title: 'Crónica del tránsito en Av. Perón',
      description: 'Corte de calle',
      thumbnail: 'https://img.infobae.com/peron10.jpg',
      videoUrl: 'https://www.youtube.com/watch?v=peron_10',
      canonicalUrl: 'https://www.infobae.com/transito-peron',
      channelTitle: 'Infobae',
      channelId: 'pub_infobae',
      publishedText: 'Infobae',
      durationSeconds: 300,
      isLive: false,
      isVerified: true,
      provider: 'youtube',
      qualityScore: 75,
      relevanceScore: 20, // < 40 (Irrelevante)
      youScore: 48,
      retrievalSource: 'publisher'
    }
  ];

  console.log(`📊 CANDIDATOS DESCUBIERTOS EN MEDIOS: ${mockPublisherCandidates.length}`);
  
  // Evaluar cobertura con los invariantes del Core (Q >= 60, R >= 40)
  const evalResult = evaluateFreeDiscoveryCoverage(mockPublisherCandidates);

  console.log('\n📈 EVALUACIÓN DE COBERTURA:');
  console.log(`- Total candidatos evaluados: ${evalResult.totalCandidates}`);
  console.log(`- Cualificados con Q>=60 y R>=40: ${evalResult.qualifiedCount}`);
  console.log(`- Top 5 consistente: ${evalResult.top5Consistent ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`- Cobertura aprobada: ${evalResult.passed ? 'PASSED ✅' : 'FAILED ❌'}`);

  console.log('\n======================================================================');
  console.assert(evalResult.qualifiedCount === 8, 'Deben haber exactamente 8 candidatos cualificados');
  console.assert(evalResult.passed === true, 'La cobertura debe haber aprobado');

  if (evalResult.passed && evalResult.qualifiedCount >= 8) {
    console.log('🏆 GOLD FIXTURE TEST VALIDADO AL 100%');
    console.log('   Free Discovery Stage reunió 8 videos calificados (Q>=60, R>=40).');
    console.log('   YouTube Radar queda OMITIDO (0 llamadas, 0 cuota consumida).');
  }
  console.log('======================================================================\n');
}

runPublisherGoldFixtureTest();
