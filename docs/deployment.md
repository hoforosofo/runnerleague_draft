# 배포와 서버 주소 설정

## 기존 서비스 유지

GitHub Pages는 `main` 브랜치의 루트(`/`)를 사용합니다.
Cloudflare 프로젝트 이름 `runnerleague-online`, Root directory `cloudflare-server`, Build command `npm ci`, Deploy command `npx wrangler deploy`는 유지합니다.
기존 Durable Objects 바인딩 이름과 migration 설정도 유지했습니다.

방의 저장 데이터와 브라우저 임시저장은 파일 이동만으로 삭제되지 않습니다.
사이트를 닫거나 나가면 참가자에서 제거됩니다. 비정상 단절은 기존 토큰으로 재접속합니다.
모든 새 참가자는 기본 관전이며 랜덤매칭은 없습니다.

## 서버 주소 변경

설정 파일은 `js/online-config.js`입니다. 실제 서버 주소를 입력하세요.

```js
export const ONLINE_SERVER_URL = 'https://실제배포주소.workers.dev';
```

또는 `cloudflare-server` 폴더에서 실행합니다.

```sh
node set-server-url.mjs https://실제배포주소.workers.dev
```

명령은 `js/online-config.js`를 수정합니다. 해당 파일을 GitHub에 커밋하세요.

## 새 Cloudflare 프로젝트

Workers & Pages → Create application → Import a repository에서 저장소를 연결합니다.

| 설정 | 값 |
|---|---|
| Worker 이름 | `runnerleague-online` |
| Production branch | `main` |
| Root directory | `cloudflare-server` |
| Build command | `npm ci` |
| Deploy command | `npx wrangler deploy` |

SQLite 바인딩과 생성 설정은 wrangler.jsonc에 포함돼 있습니다.
무료 사용 한도와 사용량은 Cloudflare 대시보드에서 확인하세요.

## 배포 후 확인

1. GitHub Pages와 Cloudflare 배포 성공을 확인합니다.
2. 서버의 `/health`에 정상 응답이 나오는지 확인합니다.
3. 방 만들기, 팀장 카드 선택, 상단 시작을 확인합니다.
4. 다른 브라우저의 초대 링크 입장, 기본 관전, 재접속을 확인합니다.

CSS 적용 순서는 유지했습니다. Render 배포 파일과 Node 전용 서버는 제거했습니다.
