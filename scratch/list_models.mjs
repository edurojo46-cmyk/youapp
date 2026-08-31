import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8')
const key = env.match(/GEMINI_API_KEY=(.*)/)?.[1]?.trim() || env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

async function test() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  console.log(await res.json())
}

test()
