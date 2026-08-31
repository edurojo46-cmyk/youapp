import fs from 'fs'

const env = fs.readFileSync('.env.local', 'utf-8')
const geminiKey = env.match(/GEMINI_API_KEY=(.*)/)[1].trim()

async function testGemini(model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Hola" }] }]
    })
  })
  console.log(model, res.status, await res.text())
}

testGemini('gemini-1.5-flash')
testGemini('gemini-1.5-flash-latest')
testGemini('gemini-pro')
