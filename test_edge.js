require('dotenv').config({ path: '.env.local' });
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;

(async () => {
  try {
    const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/ai-research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({ prompt: 'Documentales de historia', userId: 'anonymous' })
    });
    
    const text = await res.text();
    console.log("STATUS:", res.status);
    console.log("RESPONSE:", text);
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
