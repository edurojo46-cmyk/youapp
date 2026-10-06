import dotenv from 'dotenv';
import { AtlasMultiSourceWheelStream } from '../../src/lib/atlas/discovery/AtlasMultiSourceWheelStream.mjs';

dotenv.config();

async function test() {
  console.log('Testing AtlasMultiSourceWheelStream with 4 Verified Winners...');
  const stream = new AtlasMultiSourceWheelStream({
    targetBufferSize: 500,
    minRefillThreshold: 200,
    maxBufferSize: 1000,
    hmacSecret: process.env.ATLAS_IGJ_IDENTITY_HMAC_KEY
  });

  await stream.refillBuffer();
  console.log(`Buffer length after refill: ${stream.buffer.length}`);
  console.log(`Active motors: ${Array.from(stream.activeMotorIds).join(', ')}`);

  const batch1 = await stream.nextBatch(100);
  console.log(`Batch 1 size: ${batch1.length}`);
  
  const sourcesInBatch = {};
  const regionsInBatch = {};
  for (const item of batch1) {
    sourcesInBatch[item.sourceId] = (sourcesInBatch[item.sourceId] || 0) + 1;
    regionsInBatch[item.targetRegion] = (regionsInBatch[item.targetRegion] || 0) + 1;
  }
  console.log('Sources in batch 1:', sourcesInBatch);
  console.log('Regions in batch 1:', regionsInBatch);
  console.log('Sample candidate:', batch1[0]);

  stream.stop();
}

test().catch(console.error);
