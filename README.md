# Runner League Draft

오버워치 러너리그 모의 드래프트입니다. 화면은 GitHub Pages, 온라인 방은 Cloudflare Workers + SQLite Durable Objects로 실행합니다.

- 사이트: https://hoforosofo.github.io/runnerleague_draft/
- 온라인 서버: `js/online-config.js`에 설정
- 순서: 룩삼 → 콩콩 → 둥그레 → 푸린 → 울프
- 각 팀 딜러 2명·힐러 2명, 총 20명 선발
- 접속하면 기본 관전. 팀장 카드를 눌러 참여·선택 해제
- 방장이 상단에서 시작. 빈 팀은 설정에 따라 AI 선발
- 시간 설정·카운트다운·랜덤매칭 없음

## 파일 위치

| 위치 | 내용 |
|---|---|
| `index.html` | GitHub Pages 진입 화면 |
| `js/` | 화면, 온라인 연결, 드래그, 아이콘, 서버 주소 |
| `css/` | 공통 화면, 모바일, 버튼 스타일 |
| `assets/` | 선수 사진, 글꼴, 라이선스 |
| `shared/model.mjs` | 선수 목록, 고정 순서, 포지션 정원 |
| `cloudflare-server/` | 온라인 서버, 방 권한, 배포 설정 |
| `cloudflare-server/ai/` | AI 선발 정책과 평가 근거 |
| `tests/` | 방 동작, AI, 파일 경로 검증 |
| `docs/` | 배포와 AI 정책 안내 |

## 배포

GitHub Pages는 기존처럼 `main` 브랜치의 루트(`/`)를 사용합니다.
Cloudflare Root directory는 `cloudflare-server`, Build command는 `npm ci`, Deploy command는 `npx wrangler deploy`입니다.

[배포 안내](docs/deployment.md)와 [기존 파일 정리 안내](docs/cleanup.md)를 확인하세요.

## 개발 및 검증

Node.js 22 이상이 필요합니다.

```sh
cd cloudflare-server
npm ci
npm run check
npm test
```

`npm run check`는 실제 게시 없이 배포 구성만 검증합니다.
`npm test`는 구조, Cloudflare 로컬 런타임, AI 선발 정책을 검증합니다.
`npm run dev`는 서버만 실행합니다. 화면은 저장소 루트를 정적 HTTP 서버로 실행하세요.
로컬 화면의 허용 주소는 `http://127.0.0.1:8766`과 `http://localhost:8766`입니다.

## AI 자료

- [현재 정책](docs/ai-policy.md)
- [최근 반영 근거](docs/ai-evidence.json)
- [이전 평가 기록](docs/ai-history.md)

실시간 커뮤니티 수집이나 외부 유료 AI API는 사용하지 않습니다.
새 자료를 반영하려면 정책과 근거를 갱신해 다시 배포합니다.
