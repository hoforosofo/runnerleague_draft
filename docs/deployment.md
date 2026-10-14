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

## 혼자 동시접속 검증

`/tools/room-test.html`에서 인원(기본 30명, 최대 50명)을 지정하고 테스트 시작을 누릅니다. 별도의 테스트방에 팀장 5명과 나머지 관전자를 연결하고 20회 선발·최종 확정·전원 동일 상태·관전자 권한을 검사합니다. 성공/실패/중지 뒤 테스트 참가자들을 나가게 합니다. 테스트방이므로 일반 방에 영향을 주지 않습니다. 일반 탭은 접속 정보를 공유하므로 여러 탭만 여는 방식은 인원 테스트가 되지 않습니다.

한 방의 참가자 제한은 50명, 미인증/교체 연결을 포함한 소켓 제한은 80개입니다. 30명 동시 접속과 50명 입장 한도 검증은 동일 Worker 코드의 로컬 실행에서 확인했고, 실제 배포 후 별도로 검증할 수 있습니다. 테스트 표시 시간은 해당 환경의 측정치이며 운영 지연 보장은 아닙니다.
