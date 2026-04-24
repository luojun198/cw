#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get current directory for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import FormData from 'form-data';
import fetch from 'node-fetch';

// Test configuration
const API_BASE = 'http://localhost:3005';
const TEST_VOUCHER_ID = 'test-voucher-001';

// Create a test file
const testFilePath = path.join(__dirname, 'test-file.txt');
const testFileContent = 'This is a test attachment file for testing the voucher attachment functionality.';
fs.writeFileSync(testFilePath, testFileContent);

console.log('📋 Testing voucher attachment functionality...\n');

// Test 1: Health check
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

// Test 2: Login to get token
async function login() {
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Login successful');
      return data.token;
    } else {
      console.error('❌ Login failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Login error:', error.message);
    return null;
  }
}

// Test 3: Upload attachment
async function uploadAttachment(token) {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(testFilePath));

    const response = await fetch(`${API_BASE}/api/voucher/vouchers/${TEST_VOUCHER_ID}/attachments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Attachment uploaded successfully');
      return data.data;
    } else {
      const errorText = await response.text();
      console.error('❌ Upload failed:', response.status, errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Upload error:', error.message);
    return null;
  }
}

// Test 4: List attachments
async function listAttachments(token) {
  try {
    const response = await fetch(`${API_BASE}/api/voucher/vouchers/${TEST_VOUCHER_ID}/attachments`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Retrieved ${data.data.length || 0} attachments`);
      return data.data || [];
    } else {
      const errorText = await response.text();
      console.error('❌ List failed:', response.status, errorText);
      return [];
    }
  } catch (error) {
    console.error('❌ List error:', error.message);
    return [];
  }
}

// Test 5: Download attachment
async function downloadAttachment(token, attachment) {
  try {
    const response = await fetch(`${API_BASE}/api/voucher/vouchers/${TEST_VOUCHER_ID}/attachments/${attachment.id}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const buffer = await response.buffer();
      console.log(`✅ Downloaded attachment: ${attachment.original_name} (${buffer.length} bytes)`);

      // Verify content
      if (buffer.toString() === testFileContent) {
        console.log('✅ Download content matches original');
      } else {
        console.log('❌ Download content does not match');
      }
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ Download failed:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ Download error:', error.message);
    return false;
  }
}

// Test 6: Delete attachment
async function deleteAttachment(token, attachment) {
  try {
    const response = await fetch(`${API_BASE}/api/voucher/vouchers/${TEST_VOUCHER_ID}/attachments/${attachment.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Attachment deleted successfully');
      return true;
    } else {
      const errorText = await response.text();
      console.error('❌ Delete failed:', response.status, errorText);
      return false;
    }
  } catch (error) {
    console.error('❌ Delete error:', error.message);
    return false;
  }
}

// Main test flow
async function runTests() {
  console.log('🚀 Starting attachment tests...\n');

  // 1. Health check
  if (!await testHealth()) {
    console.log('\n❌ Backend not available, exiting tests');
    return;
  }

  const token = await login();
  if (!token) {
    console.log('\n❌ Could not login, exiting tests');
    return;
  }

  console.log('\n📁 Testing file operations...\n');

  // 2. Upload attachment
  const attachment = await uploadAttachment(token);
  if (!attachment) {
    console.log('\n❌ Could not upload attachment, exiting tests');
    return;
  }

  // 3. List attachments
  const attachments = await listAttachments(token);
  if (attachments.length === 0) {
    console.log('\n❌ Could not list attachments, exiting tests');
    return;
  }

  // 4. Download attachment
  const downloadSuccess = await downloadAttachment(token, attachments[0]);
  if (!downloadSuccess) {
    console.log('\n❌ Could not download attachment, continuing with deletion test');
  }

  // 5. Delete attachment
  const deleteSuccess = await deleteAttachment(token, attachments[0]);
  if (!deleteSuccess) {
    console.log('\n⚠️  Could not delete attachment');
  }

  // Cleanup
  fs.unlinkSync(testFilePath);

  console.log('\n✅ All tests completed!');
  console.log('\n🎉 You can now test the attachment functionality in the browser at:');
  console.log('   http://localhost:5175/voucher/entry');
  console.log('\n📌 Steps to test:');
  console.log('   1. Create a new voucher');
  console.log('   2. Click "上传附件" button');
  console.log('   3. Select a file to upload');
  console.log('   4. Preview the uploaded file');
  console.log('   5. Download the file');
  console.log('   6. Delete the attachment');
  console.log('\n🔧 Note: For this test to work with real vouchers, create a voucher with ID "test-voucher-001" first.');
}

// Run tests
runTests().catch(console.error);