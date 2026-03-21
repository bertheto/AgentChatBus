const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadToAbsoluteUrl() {
  const scriptPath = path.join(
    __dirname,
    '..',
    'resources',
    'web-ui',
    'extension',
    'media',
    'chatPanel.js'
  );
  const source = fs.readFileSync(scriptPath, 'utf8');
  const match = source.match(/function toAbsoluteUrl\(url\) \{([\s\S]*?)\n  \}/);
  assert.ok(match, 'Expected to find toAbsoluteUrl(url) in chatPanel.js');

  const build = new Function(
    'state',
    `return function toAbsoluteUrl(url) {${match[1]}\n  };`
  );
  return build({ baseUrl: 'http://127.0.0.1:39765' });
}

test('chat panel image url helper preserves already-absolute resource urls', () => {
  const toAbsoluteUrl = loadToAbsoluteUrl();

  assert.equal(
    toAbsoluteUrl('data:image/png;base64,abc123'),
    'data:image/png;base64,abc123'
  );
  assert.equal(
    toAbsoluteUrl('blob:mock-image-url'),
    'blob:mock-image-url'
  );
  assert.equal(
    toAbsoluteUrl('vscode-webview-resource://panel-id/upload.png'),
    'vscode-webview-resource://panel-id/upload.png'
  );
  assert.equal(
    toAbsoluteUrl('https://example.com/image.png'),
    'https://example.com/image.png'
  );
});

test('chat panel image url helper still expands relative upload paths against the server base url', () => {
  const toAbsoluteUrl = loadToAbsoluteUrl();

  assert.equal(
    toAbsoluteUrl('/static/uploads/demo.png'),
    'http://127.0.0.1:39765/static/uploads/demo.png'
  );
  assert.equal(
    toAbsoluteUrl('static/uploads/demo.png'),
    'http://127.0.0.1:39765/static/uploads/demo.png'
  );
});
