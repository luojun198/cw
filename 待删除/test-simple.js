#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3005';

// Test health check
async function testHealth() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    console.log(`✅ Health check: ${data.status}`);
    return true;
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

// Login to get token
async function getToken() {
  const response = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });

  if (response.ok) {
    const data = await response.json();
    return data.token;
  }
  throw new Error('Login failed');
}

// Test upload endpoint
async function testUpload(token) {
  // Create a test file
  const testFileContent = 'This is a test attachment file for testing the voucher attachment functionality.';
  const testFilePath = '/tmp/test-attachment.txt';
  fs.writeFileSync(testFilePath, testFileContent);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));

    const response = await fetch(`${API_BASE}/api/voucher/vouchers/test-001/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });

    const result = await response.text();

    if (response.ok) {
      console.log('✅ Upload endpoint accessible');
      return JSON.parse(result);
    } else {
      console.error('❌ Upload failed:', response.status, result);
      return null;
    }
  } finally {
    // Cleanup
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  }
}

// Main test
async function main() {
  console.log('📋 Testing attachment API endpoints...\n');

  const healthy = await testHealth();
  if (!healthy) {
    console.log('\n❌ Backend not available');
    return;
  }

  const token = await getToken();
  console.log('✅ Token obtained');

  const uploadResult = await testUpload(token);

  console.log('\n🎉 API endpoint testing completed!');
  console.log('\n📌 To test the full UI flow:');
  console.log('   1. Open http://localhost:5175/voucher/entry');
  console.log('   2. Create a new voucher');
  console.log('   3. Save it to get an ID');
  console.log('   4. Click "上传附件"');
  console.log('   5. Upload a file');
  console.log('   6. Preview the uploaded file');
}

main().catch(console.error);