# Cloudflare 전환 — GitHub 웹사이트에서 설정

이 파일 묶음은 Cloudflare 배포용 코드입니다. 계정에 실제 배포한 상태는 아닙니다.
화면은 기존 GitHub Pages를 유지하고, 온라인 서버만 Cloudflare Workers + SQLite Durable Objects로 변경합니다.

## 1. GitHub에 파일 업로드

ZIP을 풀고 기존 `runnerleague_draft` 저장소에 폴더 구조 그대로 덮어씁니다.
기존 선수 사진과 그 외 파일은 삭제하지 않습니다. `cloudflare-server`는 새 폴더입니다.
`online-server/model.mjs`, `draft-ai.mjs`, `draft-evidence.mjs`는 Cloudflare 서버도 함께 사용하는 공통 파일입니다.

GitHub 웹에서 **Add file → Upload files**를 선택해 ZIP 안의 파일과 폴더를 업로드하고 커밋하세요.
`node_modules` 폴더나 ZIP 자체를 올리는 방식이 아닙니다.

온라인 서버 주소는 아직 알 수 없으므로 `online-config.js`의 주소는 비워 두었습니다.
배포 후 3번에서 실제 주소를 넣으면 온라인 기능이 켜집니다. 혼자 하기는 그대로 동작합니다.

## 2. Cloudflare에서 서버 배포

1. [Cloudflare 대시보드](https://dash.cloudflare.com/)에 로그인합니다. 무료 Workers 플랜으로 시작할 수 있습니다.
2. **Workers & Pages → Create application → Import a repository → Get started**를 선택합니다.
3. GitHub를 연결하고 `hoforosofo/runnerleague_draft` 저장소를 선택합니다.
4. 아래 값을 입력한 뒤 **Save and Deploy**를 누릅니다.

| 설정 | 값 |
|---|---|
| Worker 이름 / Project name | `runnerleague-online` |
| Production branch | `main` |
| Root directory | `cloudflare-server` |
| Build command | `npm ci` |
| Deploy command | `npx wrangler deploy` |

Worker 이름은 `wrangler.jsonc`의 `name`과 같아야 합니다.
Durable Objects 두 개의 바인딩과 SQLite 생성 설정은 `wrangler.jsonc`에 포함돼 있습니다.
Pages의 정적 사이트 배포 화면이 아닌 **Workers 저장소 가져오기**를 선택하세요.
연결 후 GitHub 커밋이 올라오면 Cloudflare 서버도 자동으로 재배포됩니다.

공식 안내:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- https://developers.cloudflare.com/durable-objects/platform/limits/

## 3. GitHub Pages에 실제 서버 주소 연결

배포 성공 화면에 다음 형태의 실제 주소가 나옵니다.

`https://runnerleague-online.내계정이름.workers.dev`

예시의 `내계정이름`을 그대로 넣지 말고, 표시된 주소를 복사하세요.
GitHub에서 저장소 최상위의 `online-config.js`를 열고 연필 버튼을 눌러 아래 한 줄을 수정합니다.

```js
export const ONLINE_SERVER_URL = '복사한 실제 workers.dev 주소';
```

커밋한 뒤 GitHub Pages 배포가 끝나면 사이트를 새로고침합니다.
기존 브라우저에 저장된 Render 주소 설정은 이번 클라이언트에서 제거합니다.

Node.js를 사용하는 경우에는 `cloudflare-server` 폴더에서 다음 명령으로 같은 파일을 만들 수도 있습니다.

```sh
node set-server-url.mjs https://runnerleague-online.실제계정.workers.dev
```

## 4. 배포 후 확인

1. 새 서버 주소의 `/health`에 접속해 `{"ok":true,...}` 응답이 나오는지 확인합니다.
2. GitHub Pages에서 방을 만듭니다. 일반 방은 **무제한**입니다.
3. 다른 브라우저에서 초대 코드로 접속하고 팀장을 선택합니다.
4. 방장이 시작하면 대기창이 닫히고 드래프트가 보이는지 확인합니다.
5. 랜덤매칭은 5명이 모이면 팀장을 무작위로 배정하고 자동 시작합니다. 선발 시간은 **30초**입니다.

Render에서 진행 중이던 방 코드는 Cloudflare로 이관되지 않습니다. 전환 이후 새 방을 만들어 주세요.
브라우저에 저장한 로컬 임시저장 데이터는 유지됩니다.
새 서버에서 연결이 잠시 끊기면 기존 토큰으로 같은 팀에 복귀합니다.
사이트를 닫거나 나가기를 누른 참가자는 방에서 제거됩니다. 모두 나가면 방을 삭제합니다.
아무도 연결되지 않은 상태에서는 자동 선발을 중지합니다. 종료되지 않은 저장 방은 7일간 비활성이면 정리합니다.

## 비용과 운영

이번 구성은 무료 플랜에서 지원하는 SQLite Durable Objects를 사용합니다.
도메인 구매와 외부 유료 AI API는 필요하지 않습니다.
무료 요청·연산·저장 한도를 넘으면 기능이 제한될 수 있으므로 Cloudflare 사용량 화면을 확인하세요.
실제 운영 지역의 접속 지연과 무료 한도 내 수용 인원은 아직 공개 배포에서 측정하지 않았습니다.
Render의 컨테이너 휴면 복귀 대기는 제거하는 구조지만 모든 접속 시간을 보장하지는 않습니다.
Cloudflare 정상 동작 확인 후 기존 Render 서비스는 중지하거나 삭제할 수 있습니다.

## 개발 검증

```sh
cd cloudflare-server
npm ci
npm run check
npm test
```

`npm run check`는 배포 파일과 바인딩을 확인하는 dry-run이며 실제 배포하지 않습니다.
`npm test`는 Cloudflare의 로컬 Workers 런타임에서 실행합니다.

수동 배포는 같은 폴더에서 `npx wrangler login` 후 `npm run deploy`로 가능합니다.
테스트 코드나 자료 검토 문서는 사이트 화면에 표시하지 않습니다.
