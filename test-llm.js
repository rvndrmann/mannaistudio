const http = require('http');

const data = JSON.stringify({
  message: "Hello",
  episodeId: "5573742c-7137-4648-9e1f-ed56cc4d33c3",
  mentionedEntityIds: [],
  model: "kimi-2.5"
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/studio/projects/5573742c-7137-4648-9e1f-ed56cc4d33c3/director/chat',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Cookie': 'sb-cytkucdnllicnmljixwd-auth-token=some-token;' // We might need a real auth token, this won't work
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => console.log(res.statusCode, body));
});

req.write(data);
req.end();
