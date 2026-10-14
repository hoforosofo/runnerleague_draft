import fs from 'node:fs';
const input=process.argv[2];
if(!input)throw Error('사용법: node set-server-url.mjs https://runnerleague-online.내계정.workers.dev');
const url=new URL(input);
if(url.protocol!=='https:'||!url.hostname.endsWith('.workers.dev')||url.pathname!=='/'||url.search||url.hash)throw Error('배포된 HTTPS workers.dev 주소를 입력하세요.');
fs.writeFileSync(new URL('../js/online-config.js',import.meta.url),`// Cloudflare 배포 후 설정한 온라인 서버 주소\nexport const ONLINE_SERVER_URL = ${JSON.stringify(url.origin)};\n`);
console.log('js/online-config.js 설정 완료. 이 파일을 GitHub 저장소에 업로드하세요.');
