# 저장소 교체 및 정리 내역

1. 기존 main 커밋 주소를 기록하거나 Download ZIP으로 백업합니다.
2. 아래 기존 경로를 삭제하고 새 구조의 파일·폴더를 업로드합니다.
3. README.md와 index.html이 저장소 루트에 있는지 확인합니다.
4. GitHub Pages와 Cloudflare 재배포를 확인합니다.

전체 ZIP만 덮어쓰면 기존 파일이 자동 삭제되지 않습니다. 삭제 목록도 적용해야 중복이 없어집니다. assets/의 사진과 글꼴은 유지합니다.

## 삭제하거나 이동한 기존 경로

- 2602_runner_multi.html
- AI_DRAFT_POLICY.md
- AI_V7_VERIFICATION.json
- AI_V8_EVIDENCE.json
- AI_V8_UPDATE.md
- APPLY.txt
- CLOUDFLARE_SETUP.md
- CLOUDFLARE_VERIFICATION.json
- MOBILE_PERFORMANCE_FIX.md
- ONLINE_SETUP.md
- README.txt
- UNLIMITED_ROOMS.md
- UPLOAD_README.txt
- ai-worker.mjs
- app.js
- button-icons.js
- cloudflare-server/test.mjs
- controls.css
- mobile.css
- model.mjs
- online-config.js
- online-server/audit-draft-corpus.py
- online-server/draft-ai.mjs
- online-server/draft-ai.test.mjs
- online-server/draft-evidence.mjs
- online-server/model.mjs
- online-server/package-lock.json
- online-server/package.json
- online-server/server.mjs
- online-server/test.mjs
- online.js
- portrait-layout.mjs
- portrait.css
- refined.css
- render.yaml
- server.mjs
- style.css
- test.mjs
- touch-drag.js

## 기준

화면 JS는 js/, 선수 목록은 shared/model.mjs, AI는 cloudflare-server/ai/, 테스트는 tests/로 이동했습니다.
기본 CSS와 refined CSS는 적용 순서를 유지해 css/app.css로 통합했습니다.
배포 설명과 AI 근거는 docs/로 모았습니다. 이전 AI 판단의 출처는 ai-history.md에 보존했습니다.
루트의 중복 Node 서버, Render 설정, 이전 HTML과 미사용 portrait 변형은 제거했습니다.
직전 관전 기본값·랜덤매칭 제거 등 UI 변경도 포함합니다.
사이트 주소, 서버 주소, Cloudflare 프로젝트와 바인딩 이름은 유지합니다.
