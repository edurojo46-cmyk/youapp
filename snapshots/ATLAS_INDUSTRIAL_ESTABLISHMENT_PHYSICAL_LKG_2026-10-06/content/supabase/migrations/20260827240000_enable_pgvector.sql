-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create the cache table for video embeddings
CREATE TABLE public.ai_video_embeddings (
  id TEXT PRIMARY KEY, -- Use the ContentItem.id (e.g., youtube video ID)
  embedding vector(768) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create index for vector similarity search (cosine distance)
CREATE INDEX idx_ai_video_embeddings_embedding ON public.ai_video_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. Enable RLS and Policies
ALTER TABLE public.ai_video_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.ai_video_embeddings FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.ai_video_embeddings FOR INSERT WITH CHECK (true);
